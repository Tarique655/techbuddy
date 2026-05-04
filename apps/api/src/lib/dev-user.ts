import { db } from "./db.js";

/**
 * Until we have real authentication, every request runs as a single dev user.
 * We create them lazily on first use and cache the ID for the process lifetime.
 *
 * Replace this with proper auth (JWT validation against the User table)
 * when the family portal goes live.
 */
const DEV_USER_NAME = "Tariq";

let cachedUserId: string | null = null;

export async function getDevUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const existing = await db.user.findFirst({
    where: { name: DEV_USER_NAME },
  });

  if (existing) {
    cachedUserId = existing.id;
    return existing.id;
  }

  const created = await db.user.create({
    data: { name: DEV_USER_NAME, role: "SENIOR" },
  });
  cachedUserId = created.id;
  return created.id;
}
