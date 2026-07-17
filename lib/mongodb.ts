import { MongoClient, type Db } from "mongodb";

/** MongoDB client, shared across the app.
 *
 * Connection is LAZY, and deliberately so. Next imports every route module at
 * build time to collect page data, so throwing on a missing MONGODB_URI at
 * import time makes `next build` require a live database URI — CI would need
 * production secrets just to compile. Resolving the URI inside the accessor
 * moves the failure to first use, where it belongs.
 *
 * Dev mode hot-reloads modules on every edit. Without caching the client on
 * globalThis, each reload opens a fresh connection pool and eventually exhausts
 * MongoDB's connection limit. Production doesn't reload, so a module-level
 * cache is enough there.
 *
 * See docs/architecture.md §5. */

declare global {
  // `var` is required here: global augmentation doesn't work with let/const.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let cachedPromise: Promise<MongoClient> | undefined;

/** Connects on first call. Throws only if actually used without a URI. */
export function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  if (process.env.NODE_ENV === "development") {
    global._mongoClientPromise ??= new MongoClient(uri).connect();
    return global._mongoClientPromise;
  }

  cachedPromise ??= new MongoClient(uri).connect();
  return cachedPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB ?? "chatapp");
}
