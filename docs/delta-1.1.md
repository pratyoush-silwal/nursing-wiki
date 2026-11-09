# Version 1.1: learning, editing, and editorial UI

## Start the updated application

Configure the following new values in `.env` before allowing client registration:

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Nursing & Medicine <verified-sender@your-domain.example>
```

Port 587 requires STARTTLS. For implicit TLS, use port 465 and `SMTP_SECURE=true`.
The sender must be authorized by your SMTP provider. Missing SMTP configuration
leaves the wiki usable but registration returns a service-unavailable response.
Verification codes are emailed only; there is no log or development-code bypass.

For Gmail, use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and
`SMTP_SECURE=true`. Set both `SMTP_USER` and `SMTP_FROM` to your Gmail address.
Set `SMTP_PASSWORD` to a Google App Password, entered without the display spaces.
App Passwords require 2-Step Verification; see
[Google's instructions](https://support.google.com/accounts/answer/185833).
After editing `.env`, run `bash scripts/wiki.sh start` to recreate the API with
its updated environment. A plain container restart does not reload `.env`.


```bash
bash scripts/wiki.sh start
```

The build installs the added dependencies and copies MathJax, Mermaid, and Chart.js
into same-origin `/vendor/` assets. No third-party scripts are fetched at runtime.
The new client container is included automatically. Open:

- Public library: `https://localhost/`
- Client learning space: `https://localhost/client/`
- Owner workspace: `https://localhost/admin/`

The existing owner is migrated from `admins` to `users` without changing the
username, password hash, or token version. Sign in again after upgrading: new
owner tokens explicitly carry the admin role. The legacy username is retained in
the owner's email field for compatibility; client email uniqueness is enforced
separately. Existing articles, images, labels, and demo content are retained.

For development, run `npm install`, then `npm run vendor`, then the desired
`dev:api`, `dev:public`, `dev:client`, or `dev:admin` script. The client dev server
uses port 5175. `npm run build` prepares vendor assets and builds all three SPAs.
The existing package lock needs regeneration by `npm install` with registry access;
this environment could not resolve the newly introduced packages online.

## Client workflow

Create an account with email/password, enter the emailed six-digit code, then use
the learning landing page. Unverified registrations are stored separately as
password/code hashes; there is no user record before verification. Codes have no
expiry or retry limit, as specified. Registering again replaces the previous
pending code after delivery succeeds.

Client and owner JWTs use separate audiences and explicit roles, with seven-day
expiry. There is no role-change endpoint. `FREE` on the upgrade page permanently
unlocks flashcards. Owner routes cannot edit client premium status.

Live quizzes appear in the learning sidebar and landing notice. Starting a quiz
resumes the same session if one already exists. The server allows one minute per
question, capped at the quiz's 24-hour closing time. Each answer is saved as it is
selected. Submit freezes the answers and queues grading. At the deadline, the
server freezes the last saved answers even if the browser is closed; answers that
never reached the server cannot be recovered. Results poll while grading completes.

Completed attempts are insert-only and survive quiz deletion. The one-second
maintenance cycle finalizes remaining sessions before hard-deleting expired quiz
questions/answer keys. The API rejects expired quizzes immediately, independent
of that cleanup cycle. If the API is down at expiry, cleanup resumes on startup.
No TTL index is used because it could delete keys before outstanding work is graded.
A separate title/date-only history supports 0% bars for unattempted quizzes. During
a Redis outage, expiry finalization uses the same idempotent grading function.
Questions and explanations can be reviewed only by clients who completed the quiz,
and only while the quiz still exists.

Flashcards use paired `front` and `back` Markdown fences. Again replays the current
card after one other card; hard after up to three; good removes it from the current
session. This queue is deterministic, in browser memory, and resets on reload.
No ratings or scheduling data are sent to the server. The admin generates at most
one deck per article; article edits do not regenerate it.

## Owner workflow

- Select a published article, then **Edit article** to update its name/Markdown,
  move it to another folder/article, or add/replace/remove images.
- Moving an article updates its descendant ancestry. Cycles are rejected.
- Images still require safe relative paths declared in the article Markdown.
  Removing an image file leaves `[no image]` until its reference is removed or the
  image is uploaded again. Removing a Markdown reference deletes that old file.
- Changes are immediate, without revision history. Labels and decks are preserved.
- Use **Generate flashcards** on the selected article. Existing decks are retained;
  failed generation jobs can be retriggered with the same button.
- Use **Quizzes** to author questions, choices, correct choices, and explanations.
  **Publish quiz for 24 hours** activates it immediately. Live quizzes have no edit
  or delete UI/API.

Initial uploads retain their idempotent, immutable endpoint behavior; explicit
editing uses PATCH and an image replacement flag. Edit journals in `.edits/` make
content/metadata/subtree changes recoverable after a failed write. Back up `.edits/`
with the rest of the object volume. Journals are removed after successful completion.

## Rendering and design

The public landing uses cream newsprint, a large normal-weight display serif,
black pill actions, and a flat typographic illustration. Reading/product views use
white, hairlines, a 680px reading column, and 20px/32px serif body text. Licensed
fonts are substituted with Georgia/Charter and system sans. Dark mode is opt-in
on product pages; the landing stays light. There are no social-network features
from the design reference that are outside the delta's functional scope.

All article, quiz, option, explanation, flashcard, and editor-preview Markdown uses
the same safe renderer. Use `$...$` / `$$...$$` for TeX and fenced `mermaid` blocks
for diagrams. Inside flashcard front/back fences, use `~~~mermaid` fences to avoid
closing the card fence. HTML is not executed. Mermaid uses strict security mode;
MathJax is limited to base/AMS TeX packages, without user-controlled extension loads.

Animations are limited to smooth scrolling, spinners, card flips, and confetti for
100% results. Reduced-motion preferences disable them. The landing footer is exactly
`copyright by pratyoush silwal`.

Implementation references:
- [Nodemailer SMTP](https://nodemailer.com/smtp)
- [MathJax component configuration](https://docs.mathjax.org/en/v3.2/web/configuration.html)
- [Mermaid rendering and security configuration](https://mermaid.js.org/config/usage)
- [Chart.js 4.5.1 release](https://github.com/chartjs/Chart.js/releases/tag/v4.5.1)

## Verification

TypeScript and the three application bundles were checked. The backend suite
includes account verification/role separation, SMTP failure behavior, permanent
premium unlock, authoritative quiz timing, frozen submissions, idempotent grading,
expiry cleanup, deck parsing/generation, local scheduling, typeahead ranking,
article reparenting, and interrupted-edit recovery.

The browser suite includes new client registration/premium/quiz/card flows,
MathJax/Mermaid rendering, and 1440/1024/768/390px client layouts. It could not run in
this workspace because local listening sockets and Chromium are blocked. SMTP,
Gemini, Mongo/Redis integration, owner migration against a real database, Docker
startup, and the complete vendor-asset build need verification on the host.

```bash
npm install
npm run build
npm test
npm run test:browser
```

The real-service suite retains its separate `TEST_*` variables described in README.
