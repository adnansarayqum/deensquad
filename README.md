# Deen Squad parent app

The parent app for **The Deen Squad Football Academy**. It's a phone-first web app that parents add to their home screen.

| Screen | What it does |
| --- | --- |
| **Club news** | Club messages a parent taps "I've read this" on, so the club knows exactly who has read what. Unread messages stay at the top, with a badge on the tab. |
| **Friday** | One tap to say if your child is coming, a Thursday-night briefing (arrival time, kit, prayer break) and the squad headcount. Replaces Spond. |
| **To-do** | Your child's setup checklist: registration, emergency contacts, kit, monthly payments (TeamFeePay) and photo consent. |
| **Player** | Shirt number, attendance streak, badges, the weekly skills challenge and the coach's note. |
| **Coach register** | Gate check-in. Shows who's here, who's expected, and flags families with a missing payment plan. |

It runs in **demo mode** for now: one family's data (Adnan and Yusuf, U9s) with everything you tap saved in your browser, so you can show it to the club without a database. The real database schema is ready in `supabase/`.

## Run it

You need Node 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

To see it as parents will, open it on your phone (same Wi-Fi, use your computer's IP) or deploy it.

## Deploy (Vercel)

1. Import this repo at vercel.com/new. The defaults are right for Next.js.
2. Optional: add `NEXT_PUBLIC_TEAMFEEPAY_URL` with the club's TeamFeePay sign-up link.
3. Open the deployed link on a phone and use **Add to Home Screen**.

## Tests

```bash
npm run typecheck
npm run lint
npm test           # unit tests + database security tests (runs the real migration in an in-memory Postgres)
npm run build && npm run test:e2e   # taps through every flow on a phone-sized screen
```

## Project layout

```
design/tokens.json          Deen Squad design system tokens (colours, type, spacing). Source of truth.
scripts/build-tokens.mjs    Turns the tokens into src/app/tokens.css (npm run tokens)
src/app/(parent)/           News, Friday, To-do (payment, consent), Player
src/app/coach/              Coach gate register
src/lib/                    Domain types, demo data, screen view builders, Server Actions, demo cookie
supabase/migrations/        Postgres schema with row level security for the real backend
e2e/                        Playwright end-to-end tests
```

## Next steps

See the roadmap at the end of `CLAUDE.md`. Next up: connect Supabase with sign-in, then the WhatsApp chase ladder for unread messages, then the admin dashboard.
