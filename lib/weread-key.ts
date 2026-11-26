import { cookies } from "next/headers";

export const WEREAD_KEY_COOKIE = "__Host-reading-room-weread";

export async function getWeReadKey() {
  const jar = await cookies();
  return jar.get(WEREAD_KEY_COOKIE)?.value || process.env.WEREAD_API_KEY;
}
