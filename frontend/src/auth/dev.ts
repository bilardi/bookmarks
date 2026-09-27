// Local development has no Cognito: the caller is a fixed user, sent in the header
// the backend accepts only when LOCAL is true. Change it to act as somebody else.
const DEV_USER = "u1";
const DEV_NAME = "Ada Lovelace";

export interface CurrentUser {
  userId: string;
  name: string;
}

export function currentUser(): CurrentUser {
  return { userId: DEV_USER, name: DEV_NAME };
}

// Always sent, including in the production build: the gate that matters is on the
// backend, which reads this header only when LOCAL is true.
export function authHeaders(): Record<string, string> {
  return { "x-dev-user": DEV_USER, "x-dev-name": DEV_NAME };
}

// Nothing to start, to enter or to leave without a login, and the person is
// always there.
export async function startSession(): Promise<void> {}

export function hasSession(): boolean {
  return true;
}

export function refusal(): string | null {
  return null;
}

export function login(): void {}

export function logout(): void {}
