// Where the code is, and the version before this one, as bookmarks-v3.0 said at
// its bottom.
const REPO = "https://github.com/bilardi/bookmarks";
const OLD_SITE = "https://alessandra.bilardi.net/bookmarks-v3.0/";
const OLD_REPO = "https://github.com/bilardi/bookmarks-v3.0";

function Out({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Credits() {
  return (
    <p className="muted">
      This site is reproducible: you can download the code from <Out href={REPO}>GitHub</Out>. The old version of my bookmarks used a
      different source: go to the <Out href={OLD_SITE}>old version</Out>, and download its code from{" "}
      <Out href={OLD_REPO}>GitHub</Out>.
    </p>
  );
}
