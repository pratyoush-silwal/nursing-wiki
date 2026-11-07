# API contracts

Nginx exposes API routes under `/api`. The Fastify process receives the paths below
without that prefix. JSON errors use `{ "error": "message" }`; validation errors
also include field details. Responses are `Cache-Control: no-store`.

All admin routes except login require `Authorization: Bearer <token>`. Only the
single seeded owner is accepted. Unsupported mutation routes are also protected.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /admin/login` | `{ username, password }` | `200 { token }`, `401` bad credentials, `503` auth not configured |
| `PUT /admin/credentials` | `{ username, currentPassword, password }` | `204`; existing JWTs revoked |
| `GET /admin/tree` | — | `{ nodes, articles }`; materialized tree and private drafts |
| `POST /admin/articles` | `{ name, slug, parentId?: UUID \| null, folderPath?: string[] }` | `201 { id, slug, objectKey }` |
| `PUT /admin/articles/:id/content` | Raw UTF-8 Markdown, `Content-Type: text/markdown`, 1 byte–6 MB | `202 { id, labelStatus, imagePaths }` |
| `POST /admin/articles/:id/images` | Multipart, one image per request; filename is relative reference path, 1 byte–20 MB | `201 { path }` |
| `DELETE /admin/articles/:id` | Article or implicit folder UUID | `200 { deleted, pending: false }` or `202 { deleted, pending: true }` |
| `GET /admin/notifications` | — | `{ notifications }`, newest 200 |
| `PATCH /admin/notifications/:id/read` | — | `204`, or `404` |
| `GET /articles/:slug` | — | `{ id, slug, name, size, uploadedAt, labels, labelStatus, markdown, breadcrumb, images }` |
| `GET /search?q=...` | Up to 160 characters | `{ hits, source: "elasticsearch" \| "mongo" }`; empty query gives no hits |
| `GET /health/live` | — | `200 { status: "alive" }` |
| `GET /health/ready` | — | `200` ready/degraded; `503` Mongo or storage unavailable; individual checks included |

`parentId` may identify an existing folder or article. `folderPath` appends new
folder segments beneath it. Folder UUIDs are deterministic from parent UUID and
name. Articles keep a copy of their ancestor chain; empty folders have no separate
persisted records. Drafts do not materialize a path.

Metadata creation is idempotent by slug plus name and parent path. A conflict
returns `409`. Retrying uploads with identical bytes is safe. Changed Markdown or
existing image bytes return `409`; undeclared images return `400`. File size
violations return `413`, wrong media types `415`, disk-full failures `507`.

Only images declared in the published Markdown may be added. Inline and
reference-style Markdown images are recognized; examples inside code blocks are
ignored. Paths are decoded once, normalized for a leading `./`, and validated
against traversal, hidden paths, remote schemes, and allowed formats. The public
DTO's `images` maps normalized references to available `/objects/` URLs; missing
entries render `[no image]` in the reader.

Search hits contain `{ id, slug, name, labels, uploadedAt, match }`, where `match`
is `exact`, `slug`, or `label`. The response excludes drafts, missing disk content,
and items with a deletion intent, even if Elasticsearch contains stale documents.

Dates cross HTTP as ISO 8601 strings. MongoDB stores BSON dates; admin and
notification IDs are BSON ObjectIds. Article and hierarchy IDs are UUID strings.
Storage manifests include lifecycle state, content hash, ancestor nodes, declared
image paths, and pending-index state in addition to the specified article fields.

## Implementation references

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify multipart limits](https://github.com/fastify/fastify-multipart#readme)
- [Elasticsearch function-score semantics](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-function-score-query)
- [BullMQ retries and attempts](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [Gemini GenerateContent contract](https://ai.google.dev/api/generate-content)
