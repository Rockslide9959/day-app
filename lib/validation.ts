// Shared signup/login input rules — kept in one place so the signup
// route and any future "change password" feature agree on the rules.
export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string") return "Username is required";
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return "Username must be 3–32 characters";
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return "Username can only contain letters, numbers, and _ . -";
  }
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}
