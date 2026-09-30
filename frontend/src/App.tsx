import { useEffect, useState } from "react";

import type { MeView, OwnerView } from "@bookmarks/core";

import { getMe, listOwners } from "./api";
import { Credits } from "./components/Credits";
import { Link } from "./components/Link";
import { currentUser, hasSession, isCognito, login, logout, refusal, startSession } from "./auth";
import { PATHS, useRoute } from "./router";
import { Bookmarks } from "./pages/Bookmarks";
import { PublicBookmarks } from "./pages/PublicBookmarks";
import { Shared } from "./pages/Shared";
import { Usage } from "./pages/Usage";

type Session = "waiting" | "in" | "out" | "refused" | "failed";

export function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session>(isCognito ? "waiting" : "in");
  const [me, setMe] = useState<MeView | null>(null);
  const [owners, setOwners] = useState<OwnerView[]>([]);

  // The public page needs no session: starting one there would send a visitor to
  // the login, and a person just signed out straight back into it.
  const isPublic = route.name === "public";
  useEffect(() => {
    if (!isCognito || isPublic) return;
    startSession()
      .then(() => setSession(refusal() !== null ? "refused" : hasSession() ? "in" : "out"))
      .catch((e: unknown) => {
        console.error("signing in failed", e);
        setSession("failed");
      });
  }, [isPublic]);

  // GET /me is also what creates the profile of a person at the first access.
  useEffect(() => {
    if (session !== "in") return;
    getMe()
      .then(setMe)
      .catch(() => undefined);
  }, [session]);

  // The name of the owner of shared bookmarks, for their breadcrumb.
  const owner = route.name === "bookmarks" ? route.owner : undefined;
  useEffect(() => {
    if (session !== "in" || owner === undefined) return;
    listOwners()
      .then(setOwners)
      .catch(() => undefined);
  }, [session, owner]);

  if (route.name === "public") return <PublicBookmarks tags={route.tags} />;

  if (session === "failed")
    return (
      <main>
        <p>Signing in failed</p>
        <button type="button" onClick={() => window.location.assign(window.location.origin)}>
          Try again
        </button>
      </main>
    );

  // Back from Cognito with a refusal: saying so, and waiting for the person, is
  // what keeps the browser out of a loop of refused logins.
  if (session === "refused")
    return (
      <main>
        <p>
          {refusal()?.includes("not-invited")
            ? "This Google account has not been invited to bookmarks: ask the curator for an invitation."
            : `Signing in was refused: ${refusal() ?? ""}`}
        </p>
        <button type="button" onClick={login}>
          Sign in with another account
        </button>
      </main>
    );

  if (session === "out")
    return (
      <main>
        <p>Signed out</p>
        <button type="button" onClick={login}>
          Log in
        </button>
      </main>
    );

  if (session === "waiting") return <main>Signing in ..</main>;

  const ownerName = owners.find((o) => o.userId === owner)?.name ?? "Shared";

  return (
    <>
      <header className="app">
        <strong>Bookmarks</strong>
        <nav aria-label="Sections">
          <Link to={PATHS.mine}>My bookmarks</Link>
          <Link to={PATHS.shared}>Shared</Link>
          <Link to={PATHS.usage}>Usage</Link>
        </nav>
        <span className="right">
          <span>{me?.name ?? currentUser().name}</span>
          {me?.curator === true && <span className="tag">curator</span>}
          {isCognito && (
            <button type="button" onClick={logout}>
              Log out
            </button>
          )}
        </span>
      </header>
      <main>
        {route.name === "bookmarks" && (
          <Bookmarks
            owner={route.owner}
            ownerName={route.owner === undefined ? "My bookmarks" : ownerName}
            path={route.path}
            tags={route.tags}
            curator={me?.curator === true}
          />
        )}
        {route.name === "shared" && <Shared />}
        {route.name === "usage" && <Usage />}
      </main>
      <footer>
        <hr />
        <p className="muted">
          The curator of this site can read the bookmarks of everybody, to help when something goes wrong.
        </p>
        <Credits />
      </footer>
    </>
  );
}
