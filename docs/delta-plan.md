# Delta 1.1 implementation plan

1. Add verified client accounts, migrate the existing owner into users without changing credentials, isolate admin/client tokens, and add permanent FREE premium unlock.
2. Add validated immutable quizzes, persisted timed sessions, autosaved answers, idempotent queued grading, expiry cleanup, and result history including missed quizzes.
3. Add one generated Markdown deck per article, premium-only reads, and deterministic browser-only replay.
4. Add article Markdown/image editing and subtree reparenting, preserving labels/decks; add ranked typeahead.
5. Share safe Markdown/math/diagram rendering and editorial design tokens across public, client, and admin apps. Add client navigation, quizzes, charts, flashcards, upgrade, and authentication.
6. Wire SMTP, queues, Docker/Nginx, documentation and test the new business rules and responsive flows.

The functional scope is delta.md. design.md supplies visual rules for applicable pages, not unrelated social publishing features. Delta animation restrictions take precedence.

Quiz deadlines are capped by quiz expiry. A durable session holds autosaved answers; submitted attempts are immutable. Expiry finalizes outstanding sessions before deleting quiz questions/keys. A separate title/date-only history supports missed-quiz chart entries after expiry.
