import { rmSync } from "node:fs";
import { ADMIN_STATE, COACH_STATE, GATE_PARENT_STATE, GIRLS_PARENT_STATE, YOUR_DATA_PARENT_STATE } from "./helpers";

// Each run starts a fresh database, so sign-ins saved by an earlier run are dead. Delete them before any
// test, so a spec run on its own skips the tests that need another spec's sign-in instead of failing.
export default function globalSetup() {
  for (const file of [ADMIN_STATE, COACH_STATE, GATE_PARENT_STATE, GIRLS_PARENT_STATE, YOUR_DATA_PARENT_STATE]) rmSync(file, { force: true });
}
