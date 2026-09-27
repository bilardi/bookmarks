import { UserManager, WebStorageStateStore } from "oidc-client-ts";

import type { CurrentUser } from "./dev";

// The tokens live in sessionStorage, the refresh one included, and they all die
// with the tab. The pool gives them the shortest lifetimes it allows, fifteen
// minutes and an hour: the bookmarks are private, and a token copied by a script
// in the page would work for an hour at most.
const manager = new UserManager({
  // Empty in a build that is not the Cognito one, where nothing here is called.
  authority: import.meta.env.VITE_COGNITO_ISSUER ?? "",
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: "code",
  scope: "openid email profile",
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
});

// The renewal replaces the tokens, and what the API receives is the one kept here.
manager.events.addUserLoaded((user) => {
  keep(user.id_token, user.profile.name, user.profile.sub);
});

let token: string | null = null;
let person: CurrentUser | null = null;
let refused: string | null = null;

// Left behind by the way out and read by the way in: without it, leaving would
// land on a site that asks for a login, so the session would come straight back.
const LEAVING = "bookmarks-signed-out";

// Called once before the pages are shown, and it does one of four things: it
// shows a refusal just come back from Cognito, it finishes a login just come back,
// it recovers the session of this tab, or it starts a login. One run only, however
// many times it is called: React mounts twice in development.
let started: Promise<void> | null = null;

export function startSession(): Promise<void> {
  started ??= start();
  return started;
}

async function start(): Promise<void> {
  if (window.sessionStorage.getItem(LEAVING) !== null) {
    window.sessionStorage.removeItem(LEAVING);
    return;
  }
  const params = new URLSearchParams(window.location.search);
  // Refused by the invitation trigger, or by Google: Cognito comes back with an
  // error instead of a code. Starting a login here would be refused again, and the
  // browser would go round in a loop.
  if (params.has("error")) {
    refused = params.get("error_description") ?? params.get("error");
    window.history.replaceState({}, "", window.location.pathname);
    return;
  }
  if (params.has("code")) {
    const user = await manager.signinCallback();
    window.history.replaceState({}, "", window.location.pathname);
    if (user !== undefined && user !== null) keep(user.id_token, user.profile.name, user.profile.sub);
    return;
  }
  const user = await manager.getUser();
  if (user !== null && !user.expired) {
    keep(user.id_token, user.profile.name, user.profile.sub);
    return;
  }
  // Expired tokens are not the end of the session: the refresh one may still be
  // good, and renewing here is what makes a tab picked up later carry on.
  if (user !== null) {
    const renewed = await manager.signinSilent().catch(() => null);
    if (renewed !== null) {
      keep(renewed.id_token, renewed.profile.name, renewed.profile.sub);
      return;
    }
  }
  await manager.signinRedirect();
}

function keep(idToken: string | undefined, name: string | undefined, sub: string): void {
  token = idToken ?? null;
  person = { userId: sub, name: name ?? sub };
}

export function currentUser(): CurrentUser {
  return person ?? { userId: "", name: "" };
}

export function hasSession(): boolean {
  return token !== null;
}

export function refusal(): string | null {
  return refused;
}

// The id token, because the name and the email are claims of that one. The
// gateway matches it on aud.
export function authHeaders(): Record<string, string> {
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

export function login(): void {
  void manager.signinRedirect();
}

// Not signoutRedirect(): Cognito reads client_id and logout_uri, not the
// parameters of the standard, as aws-card-clash found out.
export function logout(): void {
  void leave();
}

async function leave(): Promise<void> {
  await manager.removeUser();
  window.sessionStorage.setItem(LEAVING, "1");
  const endpoint = await manager.metadataService.getEndSessionEndpoint();
  if (endpoint === undefined) return;
  const url = new URL(endpoint);
  url.searchParams.set("client_id", import.meta.env.VITE_COGNITO_CLIENT_ID ?? "");
  url.searchParams.set("logout_uri", window.location.origin);
  window.location.assign(url.toString());
}
