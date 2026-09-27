import { useCallback, useEffect, useRef, useState } from "react";

import type { ItemView } from "@bookmarks/core";

import { messageOf, requestDownload } from "../api";
import { IconButton } from "./Icon";

export type ViewerKind = "audio" | "video" | "pdf" | "image" | "download";

export function viewerKind(contentType: string): ViewerKind {
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  return "download";
}

interface Props {
  item: ItemView;
  owner?: string;
  onClose: () => void;
}

// A signed URL lasts an hour, and the player reuses it for every range request of
// the same file. When it expires during a long pause, the next request fails: a
// new address is asked for, and the player goes on from the second it was at. One
// retry per address, because a file that really cannot play would loop for good.
export function Viewer({ item, owner, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const resumeAt = useRef(0);
  const retried = useRef(false);
  const kind = viewerKind(item.file?.contentType ?? "");

  const load = useCallback(() => {
    requestDownload(owner, item.id)
      .then((d) => setUrl(d.url))
      .catch((e: unknown) => setError(messageOf(e)));
  }, [owner, item.id]);

  useEffect(load, [load]);

  function onMediaError(): void {
    if (retried.current) {
      setError("The file cannot be played");
      return;
    }
    retried.current = true;
    resumeAt.current = media.current?.currentTime ?? 0;
    load();
  }

  function onLoaded(): void {
    if (media.current !== null && resumeAt.current > 0) {
      media.current.currentTime = resumeAt.current;
      resumeAt.current = 0;
      void media.current.play().catch(() => undefined);
    }
  }

  const name = item.file?.name ?? item.title;
  return (
    <div className="panel viewer">
      <IconButton icon="close" label="Close" onClick={onClose} />
      {error !== null && <p role="alert">{error}</p>}
      {error === null && url === null && <p>Loading ..</p>}
      {error === null && url !== null && kind === "audio" && (
        <audio ref={(el) => void (media.current = el)} controls src={url} onError={onMediaError} onLoadedMetadata={onLoaded} />
      )}
      {error === null && url !== null && kind === "video" && (
        <video ref={(el) => void (media.current = el)} controls src={url} onError={onMediaError} onLoadedMetadata={onLoaded} />
      )}
      {error === null && url !== null && kind === "pdf" && <iframe title={name} src={url} />}
      {error === null && url !== null && kind === "image" && <img alt={item.title} src={url} />}
      {error === null && url !== null && kind === "download" && <a href={url}>{`Download ${name}`}</a>}
    </div>
  );
}
