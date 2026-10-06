import "server-only";

// Work started after a response (notifying parents of a post, a plan or a practice sheet) runs one task at a time in
// this server process, so several posts in a row don't open several database transactions and push runs at once.
// The hourly cron route doesn't use this queue.

let tail: Promise<void> = Promise.resolve();

/** Runs `fn` after every task queued before it. Logs a failure and never rejects, so one failure doesn't stop the rest. */
export function enqueue(label: string, fn: () => Promise<unknown>): Promise<void> {
  const queued = Date.now();
  const run = tail.then(async () => {
    const waited = Date.now() - queued;
    if (waited >= 1000) console.info(`[background] ${label} waited ${Math.round(waited / 1000)} s in the queue`);
    try {
      await fn();
    } catch (error) {
      console.error(`[background] ${label} failed:`, error instanceof Error ? error.message : error);
    }
  });
  tail = run;
  return run;
}
