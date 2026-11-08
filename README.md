# Nursing & Medicine Wiki

A single-owner medical reference library: immutable Markdown articles, relative
images, implicit folders, public reading/search, and a separate administration app.

The implementation follows [specifications.md](specifications.md). See the
[build plan](docs/build-plan.md), [architecture](docs/architecture.md),
[API contracts](docs/api.md), and [verification record](docs/verification.md).

## Run with Docker Compose

Requires Docker with Compose, approximately 4 GB of available memory, and a TLS
certificate for the hostname you will use. Only Nginx publishes host ports.

1. Copy `.env.example` to `.env`. Replace the Mongo password, `MONGO_URL` credentials,
   `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. Generate a JWT secret with
   `openssl rand -hex 32`. Percent-encode special characters in the Mongo URI.
   The application refuses the example owner password and JWT placeholder.
2. Set `GEMINI_API_KEY` and a currently available `GEMINI_MODEL` for labeling.
   Without these, reading and slug search still work; label jobs eventually fail
   into the DLQ and produce notifications.
3. Create the TLS directory:

   ```sh
   mkdir -p infra/tls
   ```

   `scripts/wiki.sh start` checks `/data/objects` and repairs its ownership for
   container UID 1000 when needed. It uses `sudo` only if elevated permission is
   required, and only for that dedicated object-storage directory.

4. Put your certificate at `infra/tls/fullchain.pem` and its private key at
   `infra/tls/privkey.pem`. For local development only, you can generate a
   self-signed certificate (your browser will require a local trust exception):

   ```sh
   openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
     -keyout infra/tls/privkey.pem -out infra/tls/fullchain.pem \
     -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
   chmod 600 infra/tls/privkey.pem
   ```

5. Start and manage the stack from the repository root:

   ```sh
   bash scripts/wiki.sh start
   ```

   The start command builds the images, starts the services, and waits for
   health checks. Use these commands to operate the stack:

   ```sh
   bash scripts/wiki.sh status       # service and health status
   bash scripts/wiki.sh logs api     # follow API logs
   bash scripts/wiki.sh stop         # stop services, preserving containers/data
   bash scripts/wiki.sh restart      # restart services
   bash scripts/wiki.sh down         # remove containers/network, preserve data
   ```

   `down` preserves named volumes and `/data/objects`; do not add `-v` if you
   want to retain application data.

Open `https://localhost/` for the library and `https://localhost/admin/` for owner
access. The first boot seeds the owner from environment variables. Future boots
preserve changed credentials. After initial setup, remove `ADMIN_PASSWORD` from
the runtime environment if you do not need automated seeding after restoration.

The API starts even if Redis, Elasticsearch, Gemini, or owner authentication are
unavailable. MongoDB and object storage are required for content reads. Readiness
returns `degraded` when optional dependencies are down; liveness stays independent.

## Demo nursing collection

To populate a running installation with sample content, rebuild the API image and
run the importer from the repository root:

```sh
bash scripts/wiki.sh start
bash scripts/wiki.sh seed-demo
```

Enter the **current** owner username and password when prompted. The importer adds
106 nested articles (including 80 practice, procedure, and medicine topics) under
**Nursing practice demo library**, plus one image. It is safe to rerun: published
articles are skipped, and drafts from an interrupted import are resumed. Browse the
collection at `https://localhost/article/demo-nursing-library` or find topics by
their `demo-` slugs in search.

The sample articles remain **pending** for labels until you press **Retry pending &
failed labels** in the admin library. That button also retries other pending and
failed articles, so expect up to 106 new label jobs and associated Gemini usage when
you press it. The sample text is an educational overview with links to source
guidance; use current orders and local clinical policy for real care. To remove the
collection, delete its top-level article in the admin explorer; that also deletes
its descendants.

## Local development

Use Node 24 LTS (22.12+ is supported). Direct dependencies are pinned. Run
`npm install` on a machine with npm registry access to resolve dependencies and
generate `package-lock.json`; commit that lockfile on your feature branch before
release. The restricted build environment could not fetch the backend packages,
so a complete lockfile is **not** supplied or claimed to be verified.

For API development, set `.env` URLs to your reachable development services and
set `OBJECT_ROOT` to a writable, dedicated directory. Then run separate terminals:

```sh
npm install
npm run dev:api
npm run dev:public
npm run dev:admin
```

Public development uses `http://127.0.0.1:5173`; administration uses
`http://127.0.0.1:5174/admin/`. Both proxy `/api` to port 3000. Image serving is an
Nginx responsibility, so use Compose for complete image delivery and TLS checks.
The demo collection above can be imported into a running installation.

## Upload and organize

Choose a destination in the admin explorer, then select **Upload article**. Supply
a name, a globally unique lowercase slug, a Markdown file, optional new folder
segments, and images. Match each image's relative path to its Markdown reference:

```markdown
# Example topic

![Diagram](images/diagram.png)
```

Supported image formats: PNG, JPEG, GIF, WebP, AVIF. Paths cannot be absolute,
contain `..`, reference hidden files, or use remote/data URLs. HTML images and SVG
are rejected. Markdown is rendered without executing raw HTML. Missing images
display exactly `[no image]`.

An upload first reserves private metadata, then publishes immutable Markdown, then
uploads images individually. New folders become visible with successful Markdown
publication. A network failure can be retried using **Resume** for a draft or
**Add missing images** for a published article. Identical bytes are accepted;
replacement bytes are rejected. Delete and recreate an article to change it.

Deleting a folder or parent article also deletes every descendant. The UI asks for
confirmation. Disk bytes disappear before metadata and search cleanup; interrupted
deletions resume automatically. When Elasticsearch is unavailable, the endpoint
returns `202` and retains a cleanup intent. A completion notification arrives when
all required stores have been cleaned.

## Tests and builds

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

The core suite uses temporary object directories and in-memory repository/index
adapters; HTTP tests exercise Fastify through `inject` without a listening socket.
The browser suite uses the built SPAs and controlled API responses. It checks
search, reading, image fallback, unsafe Markdown, uploads, deletion confirmation,
sign-out, and mobile overflow. Install the pinned Playwright Chromium with
`npx playwright install chromium`, or set `CHROMIUM_PATH` to a compatible installed
Chromium. Screenshots are written under ignored `test-results/`.

For real-service integration, start a **dedicated test** MongoDB, Elasticsearch,
and Redis instance and provide these environment variables:

```sh
TEST_MONGO_URL=mongodb://127.0.0.1:27017 \
TEST_REDIS_URL=redis://127.0.0.1:6379/15 \
TEST_ELASTICSEARCH_URL=http://127.0.0.1:9200 \
npm run test:services
```

This suite creates UUID-named test databases/indexes, runs HTTP uploads and real
BullMQ workers with a deterministic Gemini substitute, checks strict search
ordering, accelerates the scheduled second failure, checks DLQ/notifications,
and deletes only its own documents/jobs. Empty test databases/indexes remain; no
drop/flush operation is run. Do not point it at production services. Missing test
environment variables skip the real-service suite explicitly.

## Operation and recovery

- Run exactly **one API/worker instance per object volume**. The process serializes
  mutations; there is no distributed writer lock. Public reads remain concurrent.
- The volume contains `articles/{uuid}/content.md`, image paths, and private
  `.manifest.json` files, plus `.drafts/` and `.deletions/`. Atomic manifests are the
  source for rebuilding metadata and ancestry. Never expose this whole directory
  with a generic static server. Nginx only permits approved image extensions.
- Every 15 seconds the API reconciles manifests, finishes deletions, indexes pending
  articles, and dispatches pending label jobs. A recreated Elasticsearch index is
  rebuilt automatically. This full scan is intended for a single-owner collection.
- BullMQ runs on Redis with AOF persistence and `noeviction`. Two total label
  attempts are separated by 12 hours. Exhausted jobs enter `label-generation-dlq`;
  failed labels never prevent reading or slug search. Orphaned jobs are removed
  during reconciliation. Labels are validated as 6–7 distinct short strings.
- Search uses a single Elasticsearch query with fixed tiers: exact slug (3),
  substring slug (2), substring label (1), then slug for deterministic ties. It
  returns at most 100 results. MongoDB fallback uses escaped regular expressions
  and the same ordering. Article bodies are never indexed or searched.
- Credentials are bcrypt-hashed; JWTs use HS256, expire after 7 days, and require
  the current owner's token version. Credential changes invalidate all sessions.
  Browser tokens are held in session storage and cleared on sign-out/401.
- No content caching or request rate limiting is configured, as specified.
  Put the deployment on appropriately controlled infrastructure.

Back up the entire object volume **and** MongoDB (owner credentials and
notifications) plus Redis (pending attempts/DLQ). Take coordinated backups with
the writer stopped. Elasticsearch can be rebuilt. Preserve `.deletions/` during
backup and restore so deleted articles are not resurrected.

To explicitly rebuild Mongo article metadata and search documents after restoring
the volume, stop the running API so there is only one writer, then run:

```sh
docker compose --env-file .env -f infra/docker-compose.yml stop api
docker compose --env-file .env -f infra/docker-compose.yml run --rm api npm run reconcile
docker compose --env-file .env -f infra/docker-compose.yml start api
```

The reconciliation command does not recreate owner credentials or historical
notifications; restore those from MongoDB backup. Keep MongoDB available during
normal public reading even though the files are the existence source of truth.

## Delivery status

Source implementation is present for the complete requested stack. Both SPA
production builds, focused TypeScript validation, core tests, and Compose parsing
have been exercised. Full backend dependency installation, HTTP/real-service
integration, browser rendering, live Gemini, and container startup remain
unverified in this restricted environment. See the exact record in
[docs/verification.md](docs/verification.md) before deploying.
