import { z } from "zod";

import { NAME_MAX, TAGS_MAX, TEXT_MAX, TITLE_MAX } from "./limits";
import { normalizePath } from "./paths";
import { normalizeTag } from "./tags";
import type { FileStatus } from "./types";

const titleSchema = z.string().trim().min(1).max(TITLE_MAX);
const textSchema = z.string().max(TEXT_MAX);
// Only web addresses: a javascript: link would run in the page that opens it.
const linkSchema = z.url({ protocol: /^https?$/ });

export const pathSchema = z.string().transform((raw, ctx) => {
  const path = normalizePath(raw);
  if (path === null) {
    ctx.addIssue({ code: "custom", message: "invalid-path" });
    return z.NEVER;
  }
  return path;
});

const tagsSchema = z
  .array(z.string())
  .max(TAGS_MAX)
  .transform((raw, ctx) => {
    const tags = raw.map(normalizeTag);
    if (tags.some((tag) => tag === null)) {
      ctx.addIssue({ code: "custom", message: "invalid-tag" });
      return z.NEVER;
    }
    return [...new Set(tags as string[])];
  });

const fileSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  contentType: z.string().trim().min(1).max(NAME_MAX),
});

// Request bodies (validated by the backend, built by the frontend).
export const createItemBodySchema = z
  .object({
    title: titleSchema,
    text: textSchema.optional(),
    link: linkSchema.optional(),
    file: fileSchema.optional(),
    path: pathSchema.default(""),
    tags: tagsSchema.default([]),
    shared: z.boolean().default(false),
    published: z.boolean().default(false),
  })
  .refine((body) => !(body.link && body.file), { message: "link-and-file" })
  .refine((body) => !body.published || body.link !== undefined, { message: "public-needs-link" });
export type CreateItemBody = z.infer<typeof createItemBodySchema>;

// null removes the text or the link; a file is set only at creation.
export const patchItemBodySchema = z
  .object({
    title: titleSchema.optional(),
    text: textSchema.nullable().optional(),
    link: linkSchema.nullable().optional(),
    path: pathSchema.optional(),
    tags: tagsSchema.optional(),
    shared: z.boolean().optional(),
    published: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "empty-patch",
  });
export type PatchItemBody = z.infer<typeof patchItemBodySchema>;

// The adjacent item is the visible one to jump over: with a tag filter on, the
// hidden items in between keep their order.
export const moveBodySchema = z.object({
  direction: z.enum(["up", "down"]),
  adjacentId: z.string().min(1),
});
export type MoveBody = z.infer<typeof moveBodySchema>;

export const viewBodySchema = z.object({
  seen: z.boolean(),
  flag: z.boolean(),
  note: textSchema,
});
export type ViewBody = z.infer<typeof viewBodySchema>;

export const folderBodySchema = z.object({ path: pathSchema });
export type FolderBody = z.infer<typeof folderBodySchema>;

export const renameFolderBodySchema = z.object({ path: pathSchema, newPath: pathSchema });
export type RenameFolderBody = z.infer<typeof renameFolderBodySchema>;

export const shareFolderBodySchema = z.object({ path: pathSchema, shared: z.boolean() });
export type ShareFolderBody = z.infer<typeof shareFolderBodySchema>;

// Response views (produced by the backend, consumed by the frontend).
export type ViewState = ViewBody;

export interface FileView {
  name: string;
  size: number;
  contentType: string;
  status: FileStatus;
}

export interface ItemView {
  id: string;
  owner: string;
  title: string;
  text?: string;
  link?: string;
  file?: FileView;
  path: string;
  position: number;
  tags: string[];
  shared: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  view: ViewState;
}

export interface FolderView {
  path: string;
  itemCount: number;
  sharedCount: number;
}

export interface TagView {
  name: string;
  itemCount: number;
  sharedCount: number;
  // How many other tags appear with this one over what the caller can read.
  connections: number;
}

// What a visitor without a login gets of a published item, and nothing more: the
// text stays with the owner and the invited.
export interface PublicItemView {
  id: string;
  title: string;
  link: string;
  tags: string[];
}

export interface OwnerView {
  userId: string;
  name: string;
}

export interface MeView {
  userId: string;
  name: string;
  email: string;
  curator: boolean;
}

export interface UsageMonthView {
  month: string;
  getCount: number;
  getBytes: number;
  putCount: number;
  putBytes: number;
  // Missing when no prices were configured: empty, never zero.
  cost?: number;
}

export interface UsageView {
  months: UsageMonthView[];
  storedBytes: number;
  storageCost?: number;
  pricesDate?: string;
}

export interface UploadView {
  url: string;
  fields: Record<string, string>;
}

export interface DownloadView {
  url: string;
}
