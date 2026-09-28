import { useEffect, useId, useState } from "react";

import { createItemBodySchema, patchItemBodySchema, TAGS_MAX, TEXT_MAX, TITLE_MAX } from "@bookmarks/core";
import type { ItemView } from "@bookmarks/core";

import { createItem, deleteItem, listFolders, listTags, messageOf, patchItem, requestUpload, uploadFile } from "../api";
import { ActionButton } from "./ActionButton";
import { IconButton } from "./Icon";

interface Props {
  // Absent to create an item, present to change it.
  item?: ItemView;
  // The folder the form starts in: the current one.
  path: string;
  // Only the curator publishes: the others do not see the choice.
  curator?: boolean;
  onSaved: () => void;
  onClose: () => void;
}

type Kind = "link" | "file" | "note";

interface Issue {
  path: PropertyKey[];
  message: string;
}

// The schemas of the API say what is wrong; this says it in words, before anything
// is sent.
export function problemOf(error: { issues: Issue[] }): string {
  const issue = error.issues[0];
  const field = String(issue?.path[0] ?? "");
  if (issue?.message === "invalid-path") return "Folder names use lowercase letters, digits, - and _";
  if (issue?.message === "invalid-tag") return "Tags use lowercase letters, digits, - and _";
  if (issue?.message === "public-needs-link") return "Only a link can be public";
  if (field === "title") return `The title is required, at most ${TITLE_MAX} characters`;
  if (field === "link") return "The link must start with http:// or https://";
  if (field === "tags") return `At most ${TAGS_MAX} tags`;
  if (field === "text") return `The text is at most ${TEXT_MAX} characters`;
  return "Check the fields";
}

function kindOfItem(item: ItemView | undefined): Kind {
  if (item?.file !== undefined) return "file";
  if (item?.link !== undefined) return "link";
  return item === undefined ? "link" : "note";
}

export function ItemForm({ item, path, curator = false, onSaved, onClose }: Props) {
  const id = useId();
  const editing = item !== undefined;
  const [title, setTitle] = useState(item?.title ?? "");
  const [text, setText] = useState(item?.text ?? "");
  const [kind, setKind] = useState<Kind>(kindOfItem(item));
  const [link, setLink] = useState(item?.link ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState(item?.path ?? path);
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [shared, setShared] = useState(item?.shared ?? false);
  const [published, setPublished] = useState(item?.published ?? false);
  const [paths, setPaths] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  useEffect(() => {
    listFolders(undefined, undefined)
      .then((folders) => setPaths(folders.map((f) => f.path)))
      .catch(() => undefined);
    listTags(undefined)
      .then((all) => setKnownTags(all.map((t) => t.name)))
      .catch(() => undefined);
  }, []);

  const tagList = tags.split(",").map((t) => t.trim()).filter((t) => t.length > 0);

  async function save(): Promise<void> {
    if (item !== undefined) {
      const parsed = patchItemBodySchema.safeParse({
        title,
        text: text === "" ? null : text,
        link: item.file === undefined ? (link === "" ? null : link) : undefined,
        path: folder,
        tags: tagList,
        // Public means shared, as the backend says too.
        shared: shared || published,
        published: curator ? published : undefined,
      });
      if (!parsed.success) throw new Error(problemOf(parsed.error));
      await patchItem(item.id, parsed.data);
      onSaved();
      return;
    }
    if (kind === "file" && file === null) throw new Error("Choose the file to upload");
    const publishing = curator && kind === "link" && published;
    const parsed = createItemBodySchema.safeParse({
      title,
      text: text === "" ? undefined : text,
      link: kind === "link" && link !== "" ? link : undefined,
      file: kind === "file" && file !== null ? { name: file.name, contentType: file.type || "application/octet-stream" } : undefined,
      path: folder,
      tags: tagList,
      shared: shared || publishing,
      published: publishing,
    });
    if (!parsed.success) throw new Error(problemOf(parsed.error));
    const created = await createItem(parsed.data);
    if (kind === "file" && file !== null) {
      try {
        await uploadFile(await requestUpload(created.id), file);
      } catch (e: unknown) {
        throw new Error(
          `The item was created, but the file did not reach S3: ${messageOf(e)}. Delete the item and add it again.`,
        );
      }
    }
    onSaved();
  }

  async function remove(): Promise<void> {
    if (item === undefined || !window.confirm(`Delete "${item.title}"?`)) return;
    await deleteItem(item.id);
    onSaved();
  }

  return (
    <div className="panel form">
      <IconButton icon="close" label="Close" onClick={onClose} />
      <label htmlFor={`${id}-title`}>Title</label>
      <input id={`${id}-title`} maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />

      {!editing && (
        <fieldset>
          <legend>Kind</legend>
          {(["link", "file", "note"] as const).map((k) => (
            <label key={k}>
              <input type="radio" name={`${id}-kind`} checked={kind === k} onChange={() => setKind(k)} />
              {k === "link" ? "Link" : k === "file" ? "File" : "Note"}
            </label>
          ))}
        </fieldset>
      )}

      {kind === "link" && (
        <>
          <label htmlFor={`${id}-link`}>Web address</label>
          <input id={`${id}-link`} type="url" value={link} onChange={(e) => setLink(e.target.value)} />
        </>
      )}
      {kind === "file" && !editing && (
        <>
          <label htmlFor={`${id}-file`}>Choose the file</label>
          <input id={`${id}-file`} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </>
      )}
      {kind === "file" && editing && <p className="muted">{`File: ${item.file?.name ?? ""}`}</p>}

      <label htmlFor={`${id}-text`}>Text</label>
      <textarea id={`${id}-text`} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <span className="counter">{`${text.length}/${TEXT_MAX}`}</span>

      <label htmlFor={`${id}-folder`}>Folder</label>
      <input id={`${id}-folder`} list={`${id}-folders`} value={folder} onChange={(e) => setFolder(e.target.value)} />
      <datalist id={`${id}-folders`}>
        {paths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <label htmlFor={`${id}-tags`}>Tags</label>
      <input id={`${id}-tags`} value={tags} onChange={(e) => setTags(e.target.value)} />
      {knownTags.length > 0 && (
        <div className="tags">
          {knownTags
            .filter((t) => !tagList.includes(t))
            .map((t) => (
              <button key={t} type="button" className="tag" onClick={() => setTags(tagList.length === 0 ? t : `${tags}, ${t}`)}>
                {t}
              </button>
            ))}
        </div>
      )}

      <label>
        <input
          type="checkbox"
          checked={shared || published}
          disabled={published}
          onChange={(e) => setShared(e.target.checked)}
        />
        Shared with every invited person
      </label>
      {curator && (
        <label>
          <input
            type="checkbox"
            checked={published}
            disabled={kind !== "link"}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Public, for everybody without a login
        </label>
      )}

      <div className="row">
        <ActionButton label="Save" onAction={save} />
        {editing && <ActionButton label="Delete" onAction={remove} />}
      </div>
    </div>
  );
}
