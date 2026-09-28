import { useState } from "react";

import { createFolder } from "../api";
import { ActionButton } from "./ActionButton";
import { ItemForm } from "./ItemForm";

// Under an own folder: a new item in this folder, or a new folder inside it.
export function NewItem({ path, curator = false, onChange }: { path: string; curator?: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
    onChange();
  };
  return (
    <div className="new">
      {open ? (
        <ItemForm path={path} curator={curator} onSaved={close} onClose={close} />
      ) : (
        <div className="row">
          <button type="button" aria-label="Add an item" onClick={() => setOpen(true)}>
            +
          </button>
          <ActionButton
            label="New folder"
            onAction={async () => {
              const name = window.prompt("Name of the new folder");
              if (name === null || name.trim() === "") return;
              await createFolder(path === "" ? name : `${path}/${name}`);
              onChange();
            }}
          />
        </div>
      )}
    </div>
  );
}
