import { useEffect, useState } from "react";

import type { ItemView, ViewState } from "@bookmarks/core";

import { messageOf, moveItem, putView } from "../api";
import { IconButton } from "./Icon";
import { ItemForm } from "./ItemForm";
import { NoteForm } from "./NoteForm";
import { Viewer } from "./Viewer";

interface Props {
  item: ItemView;
  own: boolean;
  // The owner in the address, for the items of somebody else.
  owner?: string;
  // The visible neighbors of the same folder the arrows move past.
  up?: string;
  down?: string;
  // The tags already selected above the list, not repeated on the row.
  hiddenTags: string[];
  // With a tag filter the list mixes folders, and each row says its own.
  showPath: boolean;
  onChange: () => void;
}

type Panel = "none" | "text" | "open" | "edit";

// One row, the same structure everywhere up to the title: arrows, eye, flag, text,
// pencil, then the title and the tags.
export function ItemRow({ item, own, owner, up, down, hiddenTags, showPath, onChange }: Props) {
  const [view, setView] = useState<ViewState>(item.view);
  const [panel, setPanel] = useState<Panel>("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setView(item.view), [item.view]);

  // The change shows at once and goes back if the API refuses it.
  async function saveView(next: ViewState): Promise<void> {
    const before = view;
    setView(next);
    setError(null);
    try {
      await putView(owner, item.id, next);
    } catch (e: unknown) {
      setView(before);
      setError(messageOf(e));
    }
  }

  async function move(direction: "up" | "down", adjacentId: string): Promise<void> {
    try {
      await moveItem(item.id, { direction, adjacentId });
      onChange();
    } catch (e: unknown) {
      setError(messageOf(e));
    }
  }

  const toggle = (next: Panel): void => setPanel(panel === next ? "none" : next);
  const readable = Boolean(item.text) || (!own && view.note !== "");
  const pending = item.file?.status === "pending";
  const tags = item.tags.filter((t) => !hiddenTags.includes(t));

  return (
    <li className="item">
      <div className="row">
        {own && (
          <>
            <IconButton icon="up" label="Move up" disabled={up === undefined} onClick={() => up && void move("up", up)} />
            <IconButton icon="down" label="Move down" disabled={down === undefined} onClick={() => down && void move("down", down)} />
          </>
        )}
        <IconButton
          icon={view.seen ? "eye" : "eye-off"}
          label={view.seen ? "Seen" : "Not seen"}
          pressed={view.seen}
          onClick={() => void saveView({ ...view, seen: !view.seen })}
        />
        <IconButton
          icon="flag"
          label="Flag"
          pressed={view.flag}
          className={view.flag ? "flagged" : undefined}
          onClick={() => void saveView({ ...view, flag: !view.flag })}
        />
        {readable ? (
          <IconButton icon="text" label="Text" pressed={panel === "text"} onClick={() => toggle("text")} />
        ) : (
          <span className="icon-space" />
        )}
        <IconButton icon="pencil" label={own ? "Edit" : "Edit your note"} pressed={panel === "edit"} onClick={() => toggle("edit")} />
        {item.link !== undefined ? (
          <a className="title" href={item.link} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          <button
            type="button"
            className="title"
            disabled={pending}
            onClick={() => toggle(item.file !== undefined ? "open" : "text")}
          >
            {pending ? `${item.title} (uploading)` : item.title}
          </button>
        )}
        {showPath && <span className="path">{item.path === "" ? "/" : item.path}</span>}
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      {error !== null && <p role="alert">{error}</p>}
      {panel === "text" && (
        <div className="panel">
          <IconButton icon="close" label="Close" onClick={() => setPanel("none")} />
          {item.text && <p className="text">{item.text}</p>}
          {!own && view.note !== "" && (
            <>
              <h4>Your note</h4>
              <p className="text">{view.note}</p>
            </>
          )}
        </div>
      )}
      {panel === "open" && item.file !== undefined && <Viewer item={item} owner={owner} onClose={() => setPanel("none")} />}
      {panel === "edit" && !own && (
        <NoteForm
          owner={owner}
          item={item}
          view={view}
          onSaved={(next) => {
            setView(next);
            setPanel("none");
          }}
          onClose={() => setPanel("none")}
        />
      )}
      {panel === "edit" && own && (
        <ItemForm
          item={item}
          path={item.path}
          onSaved={() => {
            setPanel("none");
            onChange();
          }}
          onClose={() => setPanel("none")}
        />
      )}
    </li>
  );
}
