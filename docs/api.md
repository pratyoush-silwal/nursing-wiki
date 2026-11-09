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
| `POST /admin/articles` | `{ name, slug, parentId?: UUID \| null, folderPath?: string[], deferLabels?: boolean }` | `201 { id, slug, objectKey }` |
| `PUT /admin/articles/:id/content` | Raw UTF-8 Markdown, `Content-Type: text/markdown`, 1 byte–6 MB | `202 { id, labelStatus, imagePaths }` |
| `POST /admin/articles/:id/images` | Multipart, one image per request; filename is relative reference path, 1 byte–20 MB | `201 { path }` |
| `DELETE /admin/articles/:id` | Article or implicit folder UUID | `200 { deleted, pending: false }` or `202 { deleted, pending: true }` |
| `POST /admin/labels/retry` | — | `{ retried }`; immediately queues published pending/failed and dead-letter label jobs with a fresh attempt budget; active jobs are left alone |
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
`deferLabels: true` leaves a published article pending until the owner uses the
manual label retry action. The demo importer uses this option.

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
owner notification IDs are BSON ObjectIds; client notification IDs are opaque strings.
User, article, quiz, attempt, deck, and hierarchy IDs are UUID strings.
Storage manifests include lifecycle state, content hash, ancestor nodes, declared
image paths, and pending-index state in addition to the specified article fields.

## Implementation references

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify multipart limits](https://github.com/fastify/fastify-multipart#readme)
- [Elasticsearch function-score semantics](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-function-score-query)
- [BullMQ retries and attempts](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [Gemini GenerateContent contract](https://ai.google.dev/api/generate-content)


## Learning and editing additions

Client routes require a client Bearer token; owner tokens are rejected there. Client
tokens cannot access `/admin/*`. Public article/search routes remain unauthenticated.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /auth/register` | `{email,password}` | `202`; email sent, no user created |
| `POST /auth/verify` | `{email,code}` | `{token}`; creates verified client |
| `POST /auth/login` | `{email,password}` | `{token}` |
| `GET /auth/me` | — | `{id,email,role,premium}` |
| `POST /premium/unlock` | `{code:"FREE"}` | `{premium:true}` permanently |
| `GET /search/suggest?q=` | Minimum 3 characters | Same ranking as search, at most 5 hits |
| `POST /admin/quizzes` | `{title,questions:[{id,stem,options,correctIndex,explanation?}]}` | `201`; live for 24 hours |
| `GET /admin/quizzes` | — | Live quizzes, including keys |
| `GET /quizzes` | — | Live quiz summaries without keys, `serverNow` |
| `POST /quizzes/:id/start` | — | Existing/new session, questions without keys, `startedAt`, `deadlineAt`, `serverNow` |
| `PUT /quizzes/:id/answers` | `{answers:{questionId:index}}` | Saves answers before deadline |
| `POST /quizzes/:id/submit` | `{answers:{questionId:index}}` | `202`; immutable submission, grading queued |
| `GET /quizzes/attempts/me` | — | `{results}` with title/date, own attempt or null, status |
| `GET /quizzes/:id/review` | — | Live questions/keys/explanations, only after own completed attempt |
| `POST /admin/articles/:id/flashcards` | — | `202` queued, or `{exists:true}` |
| `GET /flashcards` | Premium client | Deck summaries |
| `GET /flashcards/by-article/:articleId` | Premium client | Deck Markdown |
| `GET /notifications` | — | Own notifications plus active-quiz notices |
| `PATCH /notifications/:id/read` | — | Marks only the caller's notification read |
| `PATCH /admin/articles/:id` | `{name?,parentId?,markdown?}` | Updated article; labels/deck preserved |
| `POST /admin/articles/:id/images?replace=true` | One multipart image | Explicitly replaces/adds a declared image |
| `DELETE /admin/articles/:id/image?path=...` | Safe relative path | Removes that image file |

Non-premium flashcard requests return `403 {error:"upgrade to premium",code:"PREMIUM_REQUIRED"}`.
Submitting after the deadline freezes the last saved answers; late payloads are
ignored. Submitted answers and final attempts cannot be changed. There are no quiz
mutation routes after creation, role-change routes, or premium-revocation routes.

`GET /admin/articles/:id/flashcards` (owner only) returns `status`: `none`, `queued`, `generating`, `ready`, or `failed`, with a safe error message for failures.
