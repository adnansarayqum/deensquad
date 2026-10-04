import "server-only";

import { cookies } from "next/headers";
import { DEMO_COOKIE, decodeState, type DemoState } from "./demo-state";
import { buildParentView, buildRegisterView } from "./views";

// Only the demo data source exists today. When Supabase is connected, branch on
// process.env.DATA_SOURCE here and return the same view shapes from the database.

export async function readDemoState(): Promise<DemoState> {
  const store = await cookies();
  return decodeState(store.get(DEMO_COOKIE)?.value);
}

export async function getParentView() {
  return buildParentView(new Date(), await readDemoState());
}

export async function getRegisterView() {
  return buildRegisterView(await readDemoState());
}
