# App council protocol

## Coordination and boundaries

The main Claude Code conversation coordinates every delegation. Each subagent
returns its report to the main conversation. The coordinator carries context
forward explicitly; a subagent's file does not schedule or run a council by itself.
No worker has the Agent tool. Do not create nested councils. Do not simulate
independent agents when delegation is unavailable. Report that limitation.

Specialists inspect the same snapshot independently. Do not give one specialist
another's conclusions before its initial review. The critic deliberately receives
all reports afterwards. The judge receives the brief, findings, counterarguments
and evidence. The builder receives only the authorised implementation order plus
the relevant evidence and constraints. QA then receives the diff and acceptance criteria.

## Workflow

1. Inspect applicable project guidance and working-tree state. Establish the brief,
   core journey, milestone, revision, relevant uncommitted changes and authority.
   Capture existing test failures before attributing problems to new work.
2. Full mode: independently delegate product, UX, architect, security and QA.
   Concurrency is useful for independent reads; bound it to available capacity.
   QA alone runs scoped tests; coordinate shared test resources and generated
   outputs to avoid races. No source edits during the audit snapshot.
3. Pass all reports to the critic. Request only checks that could change a decision.
4. Pass the brief, reports, counterarguments and evidence to the judge. Deduplicate
   findings and issue dispositions and a bounded batch of at most three related fixes.
5. Delegate the approved batch to the builder. Only one source writer at a time.
6. Capture the final diff/snapshot. Ask QA to evaluate each acceptance criterion
   and relevant regressions independently. The coordinator supplies browser or
   runtime evidence when specialists lack those tools; never fabricate it.
7. Ask the judge to close verified findings and issue the final verdict. If the
   batch caused a failure, allow at most one small repair batch plus revalidation.
   Pre-existing problems return to the prioritised backlog. Stop after the limit.

Any affected report becomes stale when relevant code changes. Re-review the
affected domain, including security-sensitive changes, before acceptance.
If user edits land during a review, preserve them and refresh the affected snapshot.

## Modes and cost

- Full: the five initial reviewers, critic, judge, builder when justified, QA and
  final judge. Use for the first whole-app audit or a major milestone.
- Focused: QA and the relevant specialist(s), then judge. Add critic for disputed
  or consequential tradeoffs. Use for routine changes, and disclose omitted coverage.
- Review-only: audit and judge decisions with no builder invocation.

Default mode is full for a first app audit. One pass with no justified change is
successful. Do not repeatedly ask agents to agree or manufacture a minimum backlog.
All definitions use `model: inherit`; configure models deliberately if you want
different cost/capability tradeoffs. Model diversity still does not prove correctness.

## Evidence and readiness

Every material finding needs location, user impact, severity, confidence, minimal
remedy, effort, risk and acceptance criterion. Hypotheses can be valuable, but
need investigation rather than automatic implementation. Keep priority distinct
from certainty. An untested serious risk may justify pausing the affected milestone.

Use readiness only for the stated local milestone. Review core journey completion,
data integrity, authorisation, persistence/integrations and usable failure recovery
where applicable. Unavailable critical checks mean INSUFFICIENT EVIDENCE, not a pass.
Confirmed blocking failures mean NOT READY. Noncritical outstanding work may be
documented while marking the stated milestone ready, with limits explained.

## Authority

Proceed with reversible local edits within the requested goal and current
permissions. Preserve decisions already authorised. The judge cannot create
permission to deploy, spend money, send messages, alter production data or perform
destructive operations. Do not ask for approval for routine code choices.
Ask the owner only for consequential unresolved choices or actions outside scope.

## Tool configuration

Product, UX, critic and judge have Read/Grep/Glob only. Architect and security
add WebSearch/WebFetch for official documentation. QA adds Bash for scoped local
checks. Builder adds Bash/Edit/Write. None inherits arbitrary MCP tools.
Bash is capable of mutations despite lack of Edit/Write: QA's restrictions are
behavioural instructions, not enforced read-only isolation. Keep existing Claude
permissions; do not enable bypass modes. Use isolated disposable test resources.

If a tool is unavailable, preserve the restrictions and report the limitation.
If useful browser tooling is connected, the coordinator may supply observations
or explicitly configure a known permitted tool for a relevant agent. Do not open
all MCP permissions just to gain browser access.

## Final report

Return a concise executive verdict, scope/snapshot, evidence coverage, a findings
table (ID, disposition, reason, confidence), changes, acceptance results, unresolved
risks, owner decisions if any and the next three priorities. Record dismissed
ideas as well as accepted ones. Preserve minority findings backed by evidence.
