# Council brief: Deen Squad parent app

Prepared on 5 October 2026 from the repository and the build history, before the first council run.
Facts are marked; ASSUMPTION marks what hasn't been confirmed with the club.

- **App / repository root:** this repository (Next.js 16 app, `src/`). Project guidance in `CLAUDE.md` and `AGENTS.md`.
- **Target users:** parents and carers of children at The Deen Squad Football Academy (East London, Muslim community club, ages about 5 to 15); the club's coaches (each with their own age groups); the owner and admins.
- **Core problem and completed outcome:** replace WhatsApp chasing, Excel look-ups at the gate and the separate SumUp shop. Done means: a parent signs up or is invited, signs in by email code, reads and acknowledges news, says who's coming on Friday, finishes each child's To-do (contacts, photo consent, contract, TeamFeePay link), shows a QR pass at the gate, sees plans, points and stars, and orders kit; coaches take the register and post plans/news for their groups; admins import families, chase unread news, manage the shop and download spreadsheets.
- **Current stage:** built and deployed, not yet launched. No real families imported, no coaches added. Milestone to evaluate: ready to invite the first real families.
- **Review scope:** full app.
- **Primary journeys and acceptance:** (1) parent sign-up or invite, then sign-in on a phone, including iPhone home-screen app; (2) Friday availability and gate check-in by QR; (3) news acknowledgement and the chase ladder; (4) To-do completion including contract; (5) shop order paid by bank transfer, club notified, kit marked ready; (6) coach limited to own groups.
- **Known issues / owner concerns:** product photos were AI-edited and not yet reviewed by a person; sizes copied from SumUp may be incomplete; Postgres backups need enabling in the Railway dashboard (needs the owner's 2FA); the AI tidy-up has only been tested against a stand-in.
- **Decisions to preserve:** TeamFeePay stays for fees for now (Stripe later); no pay on collection; self sign-up without approval; age groups U6, U7, U10, U12, U15; coaches post to own groups only; database stays in San Francisco; contract text is the club's own; email sign-in only (no passwords).
- **Stack:** see `package.json` / lockfile. Postgres (postgres.js) on Railway; PGlite for dev, tests and the demo. Row level security via `asUser`.
- **Environments and data boundaries:** production `parent-app` + `Postgres` on Railway (live at https://app.thedeensquadfootballacademy.co.uk); `demo` service (in-memory sample club); hourly cron function `chase-ladder`. Integrations: Resend (email), web push, Anthropic (AI drafts), SumUp (card, not configured), Twilio (not configured). Children's personal data: names, dates of birth, attendance, photo consent, emergency contacts.
- **Revision:** see `git log -1` at the start of the run. Working tree should be clean apart from these council files.
- **Evidence available:** unit and database tests (`npm test`, PGlite), end-to-end tests (`npm run test:e2e`, phone viewport, screenshots in `e2e/.results/screens`). No real-user feedback yet.
- **Constraints:** volunteer-run club, small budget; the owner is not technical; parents mostly on phones.
- **Permitted local actions:** local code changes, tests and commits. Not authorised by the council: deploying, pushing, changing production data or Railway settings, sending messages, spending money.
- **Missing information / assumptions:** ASSUMPTION most parents use iPhones and WhatsApp; ASSUMPTION about 100 to 200 families; ASSUMPTION some parents prefer Urdu, Bengali, Arabic or Somali.
- **Required checks:** `npm run typecheck && npm run lint && npm test`, and `npm run test:e2e` when screens or actions change.
- **Mode:** full. **Round limit:** one batch plus revalidation; one repair batch only for failures that batch introduces.
