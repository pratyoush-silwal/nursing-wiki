# Build plan

The source specification is `specifications.md`. Build the complete specified local,
Docker Compose application, with no cloud-hosting substitution.

1. **Foundation:** npm workspaces, pinned dependencies, strict TypeScript, shared
   Zod contracts, environment configuration, and deployment topology.
2. **API and durable content:** owner authentication and credential changes;
   staged immutable uploads; safe Markdown/image paths; implicit folder ancestry;
   article reads, breadcrumbs, recursive deletion, and notifications.
3. **Derived services:** strictly tiered Elasticsearch ranking with Mongo fallback;
   asynchronous Gemini labels through BullMQ; two attempts and DLQ; durable
   reconciliation of pending labeling, indexing, and interrupted deletion.
4. **Applications:** separate accessible React public reader/search and admin
   explorer/upload/notifications/credentials applications, with restrained clinical
   typography and color. Include loading, empty, error, and recovery states.
5. **Verification and operations:** unit and integration tests for every business
   flow, real-service integration suite, frontend build/type checks, Docker/Nginx
   configuration, seed and health scripts, backup/recovery and startup documentation.

## Implementation interpretations

These fill gaps in the contracts without changing the business invariants:

- `/admin/login` is necessarily unauthenticated; all other admin endpoints require
  the current singleton owner. Credential changes revoke existing tokens.
- Folder UUID/name/parent chains are embedded in each article's metadata. Folders
  are projected from published articles, so an empty folder cannot persist. New
  paths are reserved in a draft and become visible with the first successful MD
  upload. Articles may also act as parents, as required by the cascade contract.
- Metadata creation reserves a draft. Drafts are private and excluded from search
  and the materialized hierarchy. Repeating the same metadata/content/image request
  is safe; conflicting replacement bytes are rejected.
- The Markdown upload declares allowed relative image references. Images can be
  filled in afterward, but existing image bytes cannot be overwritten. Missing
  images render `[no image]`; raw HTML is not executed.
- Storage includes an atomic manifest alongside content to preserve metadata and
  ancestry for rebuilding MongoDB. Internal manifests and Markdown are not served
  by the Nginx image location. Deletions record a durable intent before removing
  bytes so interrupted work can be resumed rather than resurrected.
- Label work is persisted before acknowledging upload and dispatched independently
  of the HTTP response. Two total Gemini attempts, separated by 12 hours, then DLQ
  implements the daily retry limit. Infrastructure failures do not discard work.
- Search uses fixed, disjoint scoring tiers, because additive boosts alone cannot
  guarantee exact slug > partial slug > label. Body text is never indexed.
- No default password is checked into source. First boot seeds credentials supplied
  through environment variables. TLS uses operator-provided certificates.

## Change surface and checks

The repository is empty except for the specification. The change reaches shared
DTOs and validators, all API routes/services/workers, both SPA callers, fixtures,
unit/integration tests, Docker builds, Nginx routing and environment examples.
Critical checks cover authorization, traversal/XSS, immutability, empty folders,
cascades, retry/idempotency, search ordering and dependency outages. Tests use
temporary storage and explicitly isolated databases, never production data.

## Environment constraints discovered

At planning time npm registry DNS and Docker socket access are unavailable. The
`.git` directory is an empty read-only mount, not an initialized repository; no
branch, commit, or PR can be created here. Implement source in the workspace and
report any verification that remains blocked rather than claiming it passed.

## Delivery progress

- Foundation, shared contracts, API, storage lifecycle, search, labeling worker,
  both React applications, Compose/Nginx, operational scripts and documentation:
  implemented.
- Unit and filesystem-backed lifecycle tests, frontend builds, focused typecheck,
  and Compose configuration validation: exercised locally.
- HTTP, real-service, and browser test suites: implemented; execution is blocked
  by missing packages, Docker access, and socket restrictions respectively.
- Dependency lockfile and full-stack runtime verification: outstanding environment
  prerequisites, recorded in `docs/verification.md`.
