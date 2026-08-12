import { cookies } from "next/headers";

export const AUTH_COOKIE = "day_auth";

export function passcodeMatches(value: string | undefined) {
  const expected = process.env.APP_PASSCODE || "";
  if (!expected || !value) return false;
  return value === expected;
}

export async function isAuthed() {
  const store = await cookies();
  return passcodeMatches(store.get(AUTH_COOKIE)?.value);
}
