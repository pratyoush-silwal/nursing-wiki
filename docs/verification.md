# Verification record

Build environment: Node 26.8.1 on Linux, 2026-11-07. Production containers specify
Node 24 LTS. The workspace initially contained only `specifications.md`.

## Passed here

- Public React SPA production build with Vite.
- Admin React SPA production build with Vite.
- Focused strict TypeScript check: `tsconfig.core.json` (shared contracts, both
  frontends, domain services, storage, validation, label processor and core tests).
- 22 passing core unit/service integration tests using real temporary filesystem storage
  and explicit in-memory Mongo/Elasticsearch substitutes.
- Docker Compose schema/interpolation validation using `.env.example` with
  `--no-env-resolution`; no containers were started.
- Whole-source TypeScript syntax/transpilation check with `--noCheck`; this does
  not establish type correctness for adapters whose dependencies are unavailable.

Cached npm tarballs were extracted into `/tmp/nursing-deps` for these checks. The
temporary `node_modules` symlink used for verification was removed afterward.
This is not a substitute for a clean `npm install` and a committed lockfile.

## Blocked or not run

- npm registry access: `EAI_AGAIN`; Fastify, multipart and BullMQ were not cached.
  Full dependency resolution and a complete lockfile could not be generated.
- Full TypeScript/API build and Fastify HTTP tests: blocked by those dependencies.
  The installed MongoDB copy also lacks its published declaration bundle.
- Real MongoDB/Elasticsearch/Redis tests and container startup: Docker socket
  access is denied. Integration test source is included separately.
- Browser suite: local server `listen` fails with `EPERM`. A direct Chromium
  launch also fails with a socket permission error. No visual screenshot review
  is claimed. Browser tests are included and should be run outside this sandbox.
- Live Gemini: no API key supplied; the Gemini request/parser and label lifecycle
  are tested with controlled responses, not the paid API.
- Nginx runtime/TLS and image delivery: no Nginx binary or runnable container here.
- No branch, commit, PR or deployment: `.git` is an empty read-only mount rather
  than an initialized repository, and no deployment target was supplied.

## Required before release

Run a clean dependency install, commit the generated lockfile, run the full
typecheck, unit/HTTP tests and real-service integration suite, build all apps, run
browser tests and inspect their screenshots, then verify the Compose startup with
TLS and real credentials. Verify the configured Gemini model with your account.
Do not treat this source delivery as a production deployment verification.
