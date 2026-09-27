// Everything a person owns lives under their partition, so wiping a person is one
// query. The members of a tag get a partition of their own, so the items of one tag
// are one query too.
export const PROFILE_SK = "PROFILE";
export const OWNERS_PK = "OWNERS";
export const FOLDER_PREFIX = "FOLDER#";
export const TAG_PREFIX = "TAG#";
export const USAGE_PREFIX = "USAGE#";

export function userPk(sub: string): string {
  return `USER#${sub}`;
}

export function itemSk(id: string): string {
  return `ITEM#${id}`;
}

export function folderSk(path: string): string {
  return `${FOLDER_PREFIX}${path}`;
}

export function tagSk(name: string): string {
  return `${TAG_PREFIX}${name}`;
}

export function tagMemberPk(sub: string, name: string): string {
  return `USER#${sub}#TAG#${name}`;
}

export function viewSk(itemId: string): string {
  return `VIEW#${itemId}`;
}

export function usageSk(month: string): string {
  return `${USAGE_PREFIX}${month}`;
}

// The partition of gsi1: one folder of one owner, sorted by position.
export function pathGsiPk(sub: string, path: string): string {
  return `PATH#${sub}#${path}`;
}

// The key of the object never carries the folder: moving an item touches no file.
export function fileKey(sub: string, id: string): string {
  return `files/${sub}/${id}`;
}
