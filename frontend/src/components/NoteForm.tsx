import { useId, useState } from "react";

import { TEXT_MAX } from "@bookmarks/core";
import type { ItemView, ViewState } from "@bookmarks/core";

import { putView } from "../api";
import { ActionButton } from "./ActionButton";
import { IconButton } from "./Icon";

interface Props {
  owner?: string;
  item: ItemView;
  view: ViewState;
  onSaved: (view: ViewState) => void;
  onClose: () => void;
}

// On the items of somebody else the pencil edits this and nothing else: the note
// is personal, and nobody else reads it.
export function NoteForm({ owner, item, view, onSaved, onClose }: Props) {
  const id = useId();
  const [note, setNote] = useState(view.note);
  return (
    <div className="panel">
      <IconButton icon="close" label="Close" onClick={onClose} />
      <label htmlFor={id}>Your note</label>
      <textarea id={id} maxLength={TEXT_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      <span className="counter">{`${note.length}/${TEXT_MAX}`}</span>
      <ActionButton
        label="Save"
        onAction={async () => {
          const next = { ...view, note };
          await putView(owner, item.id, next);
          onSaved(next);
        }}
      />
    </div>
  );
}
