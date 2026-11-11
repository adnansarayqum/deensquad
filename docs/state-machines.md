# State machines in the app

Every place the app tracks "where something is in its life". Read this before changing a status, adding a step, or
writing a query that asks "is it paid / approved / cancelled / told yet". Written 10 Nov 2026 after a sweep of the
whole codebase; keep it in step when a state or a move is added.

**The rules that hold for all of them**

- A move is one guarded statement: `update … set <new> where id = $1 and <old state>`, then act only if a row
  came back. A second tap, a retry or two people at once then can't apply it twice. Never read the state, decide
  in code, and write.
- A side effect (email, push) is claimed in the same way (`… set told_at = now() where told_at is null`), sent
  after the response (`after()` + `enqueue`), and the claim is released if it didn't go.
- A state stored as a timestamp (`cancelled_at`, `approved_at`) means "not yet" when null. Don't add a second
  column that says the same thing.
- A state worked out from the clock (started, finished, today) is always worked out in the query from `starts_at` /
  `ends_at` on London days, never stored.

## 1. With an explicit home in code

| What | States | Where it lives | The home |
| --- | --- | --- | --- |
| Shop order | awaiting_payment → paid → ordered → ready → collected; cancelled from the first three | `shop_orders.status` (enum `order_status`), with `paid_at`, `ready_at`, `collected_at` | `src/lib/shop/order-flow.ts`: `ORDER_FLOW`, `movesInto`, `PAID_STATUSES`, `adminSteps`. A test fails if another file spells the moves or the paid list out again. |
| How a family pays | missing, self_reported, active, overdue, pay_as_you_go | `payment_status.state` (enum `payment_state`); **no row = missing** | `src/lib/payments/states.ts`: `PAYMENT_STATES`, `PAYMENT_MOVES` (who can move what), `PAYMENT_TONE`. Its test runs the two database functions from every state. |
| Staff check (DBS etc.) | ok, due (within 60 days), expired, missing | worked out from `staff_checks.expires_on` | `checkState` / `clearance` in `src/lib/staff-checks/checks.ts` |
| To-do step | done / left, per child and per family | worked out from contacts, consent, contract, payment | `STEP_ORDER`, `buildFamilyChecklist`, `stepsLeft` in `src/lib/parent/views.ts`; the admin's same questions are `NEEDS` in `src/lib/admin/needs.ts` |
| What Home shows in orange | trip, messages, notifications, todo, none | worked out per page load | `homeLead` in `src/lib/parent/views.ts` |
| Register flags at the gate | none or several of no plan, overdue, unread news, kit ready… | worked out per row | `src/lib/staff/flags.ts` (`paymentFlags`, `payingBy`, `paysAtGate`) |

### Shop order: who moves it

- A parent's card payment: awaiting_payment → paid, only through `confirmSumupPayment` (asks SumUp; matches reference
  and amount). The order page, the webhook and the hourly sweep all go through it.
- An admin: every other move, through `setOrderStatus` (cancel needs `confirm=yes`).
- `pay_by` (card / bank) is a second, small switch on an unpaid order: card → bank when a card payment fails or the
  parent chooses the transfer (`payAgain`, `payByBankInstead`); back to card if the card payment lands after all.
- Emails per step go once each (`placed_email_at`, `paid_email_at`, `ready_email_at`, `cancelled_email_at`;
  `notifyParentOrder`).

### How a family pays: who moves it

| Who | How | Move |
| --- | --- | --- |
| Parent, "I've set it up" | `report_payment_setup()` | anything but active → self_reported |
| Parent, "Pay as you go" | `report_pay_as_you_go()` | missing → pay_as_you_go, nothing else |
| Staff, child's page | `setPayment` | any → active, pay_as_you_go, missing, overdue |
| Admin, TeamFeePay file | `applyTeamFeePay` | as the file says; cancelled → missing, but pay as you go stays |

What each state sets off: missing and overdue flag the child at the gate and count in the To-do; missing and
pay_as_you_go pay the session fee at the gate; self_reported shows the club "to check". The words differ by
reader on purpose (parent: "Club checking"; admin: "To check"; spreadsheet: "Parent says set up"), so labels stay
with their screens.

## 2. Stored as timestamps or flags (no code home needed: one writer each)

| What | States (how to read them) | Written by |
| --- | --- | --- |
| Session | going ahead / cancelled (`cancelled_at`, `cancel_reason`); upcoming / today / under way / finished from the clock; open to the groups or a squad session (any `session_squads` row) | `src/lib/admin/sessions.ts` (`cancelSession`, restore, `editSession`), `saveSquad`. Parent side: `nextSessionFor`, `sessionIsFor`. The register opens only on the session's London day (`registerOpen`). |
| A child's answer for a session | none / coming / away (+ optional `away_reason`) | `saveAnswer`, `saveAwayReason`; removed when the child leaves a squad |
| Check-in | not here / here (`attendance` row, method qr or manual) | `markHere`, `checkInByPass`, `undoHere` in `src/lib/staff/checkin.ts`; session day only |
| Child approval | waiting (`approved_at` null) / approved | set null by sign-up and `add_my_child` (trigger); `approveChild` (admins) |
| Parent and the app | not invited / invited (`invited_at`) / signed in (`auth_user_id`) / notifications on (`guardian_notifications_on`) | invites, the `link_auth_user` trigger, the push subscription. Signed in wins over invited wherever it's shown. |
| Sign-in code or link | open / used / expired (15 min; invites 7 days) | `src/lib/auth/service.ts`; using either spends both |
| Announcement | needs a tap or not (`requires_ack`), urgent, read per parent (`announcement_reads`), out of date (a newer notice on the same session) | `postNews`, `postSessionNotice` (turns `requires_ack` off on the session's older notices), `answer_announcement` |
| Reminder ladder, per parent and message | app → email → sms → gate, each logged once in `announcement_chases` | `src/lib/chase/ladder.ts` only |
| Trial booking | booked / came (`arrived_at`) / didn't come (session over, no arrival) / cancelled (`cancelled_at`); paid is a `session_payments` row; follow-up sent (`follow_up_sent_at`); anonymised after 180 days | `src/lib/trials/data.ts` |
| Progress report | draft / published (`published_at`) / emailed once (`emailed_at`) | `saveReport` |
| Assistant's draft | open / confirmed / dismissed (`done_at`, `dismissed`), open for 24 hours | `src/lib/assistant/confirm.ts` |
| 20-point reward | reached → admins told → parents told → reward given (`*_told_at`, `rewarded_at`) | `src/lib/awards/milestones.ts` |
| Stars, points, badges | given → parents told (`parents_told_at`), 15 minutes after the last one | `src/lib/awards/award-notices.ts` |
| Wellbeing check-in | given → admins alerted (`alerted_at`) → followed up (`followed_up_at`) | `src/lib/wellbeing` |
| Deletion request, co-parent request | open / handled (`handled_at`) | `data-requests.ts`, `saveGuardian` |
| Away trip consent | not answered / yes / no, per child | `give_trip_consent()`; closed once the session starts |
| Uploaded photo or video | uploaded / attached / removed after 24 hours unattached | `src/lib/media` |
| Monthly summary | claimed / sent (`sent_at`); a claim with no send is retried | `summary-run.ts` |

## 3. On the phone (component state)

Already written as named states, not loose booleans: `NotificationsCard` (`State`), `InstallGate` (modes),
`PullToRefresh`, `FileViewer`, the tap helpers in `TapProblem.tsx` (idle / saving / failed), `MediaPicker` tiles.

**Left alone on purpose: the gate scanner (`PassScanner.tsx`).** It holds its state in five values and four refs
(open, error, result, retrying, checking; busy, last, pushed, wasOpen). It would read better as one state, but it
is the one screen that stopped at the gate (30 Oct 2026), it has been hardened since, and it can't be proven on a
real camera from a test. Change it only together with a check at a real session.

## Adding or changing a state

1. Find its row above. If it has a home in section 1, change the home first and let the types and tests point at
   what else to touch.
2. A new enum value needs its own migration, and can't be used in the migration that adds it.
3. If a new state needs a second writer, give it a home in code (as orders and payments have) before adding it.
4. Update this file.
