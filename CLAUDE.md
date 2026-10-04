@AGENTS.md

# Deen Squad parent app

Mobile web app (installable PWA) for The Deen Squad Football Academy. Parents sign in by email, read club news and tap to acknowledge it, say whether each child is coming to the next session, finish a per-child checklist and follow each child's progress. Coaches use a gate register. Admins import families from a CSV, send invites, post news with read receipts (and chase on WhatsApp), schedule sessions and manage staff. Data lives in Postgres (Railway in production).

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` (in-process Postgres in `.data/db` with a sample club; emails go to `.data/outbox.jsonl`; delete `.data` to reset) |
| Production build | `npm run build` then `npm run start` |
| Types (regenerates Next route types first) | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit + database tests (Vitest, PGlite) | `npm test` |
| End-to-end tests (Playwright, phone viewport) | `npm run test:e2e` (needs a build; fresh in-memory DB; `E2E_DATABASE_URL` for a real empty Postgres; `PLAYWRIGHT_CHROMIUM_PATH` to reuse an installed Chromium) |
| Apply migrations to `DATABASE_URL` | `npm run db:migrate` (Railway runs it before every deploy) |
| Regenerate design tokens | `npm run tokens` |
| Deploy | Push to `main`. Railway (project `deensquad`: service `parent-app` in Amsterdam + `Postgres` in San Francisco, so each database call crosses the Atlantic: keep queries per page few) builds it, runs `scripts/migrate.mjs` at container start (before `next start`; a failed migration fails the health check and the old version keeps serving); settings in `railway.json` override the dashboard. Live at https://parent-app-production-4b29.up.railway.app |

Before committing: `npm run typecheck && npm run lint && npm test`, and `npm run test:e2e` when screens or actions change. Stop any running `next start` before `npm run build`; rebuilding under a live server serves mismatched chunks.

## Architecture

- **Database:** `db/migrations/*.sql`, applied in name order, each once (`scripts/migrate.mjs` on Railway, `src/lib/db/migrate.ts` locally). Never edit a migration that has been deployed; add a new numbered file. `0001_auth.sql` is a Supabase-shaped auth schema (`auth.users`, `auth.uid()`, sign-in requests, sessions). `0002_club.sql` is the club schema with row level security.
- **Security model:** the app connects as the DB owner. `asUser(userId, fn)` (`src/lib/db`) opens a transaction, sets `app.user_id` and `set local role authenticated`, so every policy applies. `asSystem` bypasses RLS and is only for sign-in/sessions/invites. Parent writes that touch `players` or `payment_status` go through security-definer functions (`set_photo_consent`, `report_payment_setup`); the squad headcount comes from `squad_counts()` so parents never read other families' answers. `staff_names` exposes staff names without emails.
- **Multi-child:** `player_guardians` is many-to-many. Parent queries must filter to `my_player_ids()` / the family's age groups explicitly, because a parent who is also staff can read the whole club under RLS.
- **Drivers:** `DATABASE_URL=postgres://` uses postgres.js; `pglite://memory` or `pglite://<dir>` uses PGlite. Both behind `Database`/`Queryable` in `src/lib/db/types.ts`. Cast enums/arrays to text (`::text`, `::text[]`), counts to `::int`, dates to `::text` in selects so both drivers return the same shapes. `DEV_SEED=1` seeds the sample club (refused on Railway).
- **Auth (`src/lib/auth`):** email with a 6-digit code + single-use link (hashed in `auth.sign_in_requests`, 15 min; invites 7 days, link only). The code exists because iPhone home-screen apps don't share cookies with Safari. The link page needs a tap (email scanners). Unknown emails get the same screen and no email. Rate limits per email/IP. Sessions: random cookie `ds_session`, SHA-256 in `auth.sessions`, 90-day sliding. `src/proxy.ts` only does the optimistic cookie check; pages call `requireParent/requireStaff/requireAdmin` (`session.ts`). `ADMIN_EMAILS` creates the first admin on sign-in.
- **Email (`src/lib/email`):** Resend over HTTPS when `RESEND_API_KEY` is set; otherwise an outbox file in dev/tests. In production without a key, only admin sign-in emails are printed to the log.
- **Parent screens:** `src/app/(parent)/` (news, friday, checklist + contacts/payment/consent, player). Loaders in `src/lib/parent/load.ts`, queries in `data.ts`, pure view builders in `views.ts`, actions in `actions.ts` (call `refresh()` after in-place writes).
- **Staff:** `/coach` register (`src/lib/staff`), `/admin` (`src/app/admin`, `src/lib/admin`): CSV import (`import.ts`, preview is a dry run rolled back), invites, news + read receipts + WhatsApp chase (logged in `announcement_chases`), sessions, staff. Coaches can do everything except import/invite/edit families/manage staff.
- Tests: `db/schema.test.ts` (RLS as different people), `src/**/*.test.ts` (auth, import, views) on PGlite via `test/db.ts`; `e2e/` signs in with codes from the outbox.

## Next.js 16 notes (this is newer than most training data)

- `cookies()`, `headers()`, `params` and `searchParams` are async. Await them.
- Middleware is now `src/proxy.ts` exporting `proxy()`. Don't create `middleware.ts`.
- `LayoutProps<'/route'>` and `PageProps<'/route'>` are global types generated by `next typegen` (run by `npm run typecheck`). Route-group layouts use an explicit `{ children: ReactNode }`.
- `cacheComponents` is off. Pages that read cookies are dynamic automatically.
- Read `node_modules/next/dist/docs/` before using an API you haven't used here.

## Design system rules (source: `design/tokens.json`, the Deen Squad design system)

- Never hand-edit `src/app/tokens.css`. Change `design/tokens.json` and run `npm run tokens`. Tailwind classes come from the tokens: `bg-pitch`, `bg-cream`, `bg-paper`, `text-ink`, `text-ink-muted`, `text-grass-text`, `text-gold-text`, `text-kit-orange`, `text-on-pitch`, `rounded-app` (18px, app), `rounded-web` (12px), `rounded-dash` (6px), `rounded-pill`, `shadow-lip-grass`, `font-display`, `text-label`.
- **Surfaces vs text:** `pitch`, `pitch-deep`, `grass`, `crest-gold`, `floodlight` and `kit-orange` fills are surfaces. Text on them uses the matching `on-*` token. Green text on light grounds is `grass-text`, gold text is `gold-text`. Never use `text-pitch`: it fails contrast in dark mode.
- **Colour meanings:** `grass` = done/coming/read. `crest-gold` = achievement. `kit-orange` = needs action (the only signal colour). Every status pill also carries a word.
- **Type:** Bebas Neue (`font-display`) only for headlines, big numbers and shirt numbers. DM Sans for everything that's read.
- **App shapes:** chunky pressable buttons (`btn-chunky btn-grass` / `btn-paper`), cards at `rounded-app` with a 2px `line` border, headers in `pitch` with rounded bottom corners. One primary action per screen. Tap targets at least 48px.
- Mowing stripes (`stripes-v`) only behind headlines and empty image slots, never behind body text.
- Copy: British English, sentence case, address parents as "you", name the child, no emoji, no invented statistics. Prayer times come from a real timetable, never typed by hand.
- Both light and dark themes must pass contrast (4.5:1 text, 3:1 large text). Check both when adding colour.

## Roadmap (agreed with the club owner's pain points)

1. Done: Postgres on Railway, email sign-in, admin import/invites/news/sessions/staff. Next: verify the club's domain in Resend, set `EMAIL_FROM`, import real families.
2. Announcement chase ladder: automate what the admin does by hand today (push notification, WhatsApp after 24h, text after 48h, flag at the gate; log in `announcement_chases`).
3. Admin: Saturday report, badges and coach notes UI, weekly challenge, voice-note announcements (needs file storage).
4. Push notifications and offline support (service worker), real QR scanning for the coach register, TeamFeePay export import.
