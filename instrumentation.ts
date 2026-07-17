/** Runs once per server instance, before any request is handled. */
export async function register(): Promise<void> {
  // Guard the runtime: this file also loads in the Edge runtime, where the
  // MongoDB driver (Node sockets) can't run.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureIndexes } = await import("./lib/indexes");

  try {
    await ensureIndexes();
  } catch (error) {
    // Don't take the server down if Mongo isn't up yet — in dev that just means
    // the developer hasn't started it. Log loudly instead; the app fails at the
    // first query with a clearer message than a boot crash.
    console.error(
      "[instrumentation] Could not create indexes. Is MONGODB_URI correct and MongoDB running?",
      error,
    );
  }
}
