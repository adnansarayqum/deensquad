# Deen Squad app

The parent app and club admin for **The Deen Squad Football Academy**: a phone-first web app parents add to their home screen.

| Who | What they can do |
| --- | --- |
| **Parents** | Sign in with their email (6-digit code). Read club news and tap "I've read this". Say whether each child is coming to the next session. Work through each child's checklist: emergency contacts, payments (TeamFeePay), photo consent. Follow each child's attendance, streak, badges and coach's notes. Parents with several children see all of them; both parents can sign in. |
| **Coaches** | Gate register: who's expected, who's here, who needs a word (no payment plan or photo consent). Post news and see who hasn't read it. |
| **Admins** | Import families from a spreadsheet, email invites, fix family details, record payment status, schedule sessions, chase unread news on WhatsApp, add coaches. |

Live at https://parent-app-production-4b29.up.railway.app

## Run it

You need Node 20.9 or newer. No database to install: development uses an in-process Postgres with a sample club.

```bash
npm install
npm run dev        # http://localhost:3000
```

Sign in as `adnan@example.com` (a parent of two), `coach@deensquad.test` or `admin@deensquad.test`. Codes are written to `.data/outbox.jsonl`. Delete `.data` to start again.

## Deploy (Railway)

Project `deensquad`: the `parent-app` service and a `Postgres` service, both in Amsterdam. Every push to `main` deploys. The app runs `node scripts/migrate.mjs` as it starts, so database changes go out with the code; if a migration fails, the new version never passes its health check and the old one keeps running.

Variables on `parent-app`:

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_EMAILS` | Who becomes admin on first sign-in (comma-separated) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending sign-in codes and invites through [Resend](https://resend.com). Until set, only admin sign-in emails work: the code is printed in the Railway logs. |
| `APP_URL` | Optional. The app's web address for emailed links (defaults to the Railway domain) |
| `TEAMFEEPAY_URL`, `PRIVACY_URL` | Optional links shown in the app |

## Tests

```bash
npm run typecheck
npm run lint
npm test                            # sign-in, import, screens, and row level security as different people
npm run build && npm run test:e2e   # signs in and taps through every flow on a phone-sized screen
```

## Layout

```
db/migrations/        Postgres schema with row level security (applied in order)
scripts/migrate.mjs   Applies migrations (Railway pre-deploy)
src/app/(parent)/     News, Friday, To-do (contacts, payment, consent), Player
src/app/admin/        Club admin
src/app/coach/        Gate register
src/app/sign-in/      Email sign-in
src/lib/              Auth, database, email, parent/admin/staff data and actions
design/tokens.json    Deen Squad design system tokens (npm run tokens)
```
