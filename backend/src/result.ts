import { json, type JsonResult } from "./http";

// The result is an outcome and not an exception, like in aws-card-clash: an item
// that is not there is an answer to give, not a failure of the system.
export type ErrorCode =
  | "invalid-body"
  | "not-adjacent"
  | "invalid-target"
  | "link-and-file"
  | "public-needs-link"
  | "no-file"
  | "root-folder"
  | "forbidden"
  | "not-found"
  | "folder-exists"
  | "folder-not-empty"
  | "file-pending"
  | "file-uploaded";

export type Result<T> = { ok: true; view: T } | { ok: false; error: ErrorCode };

export function ok<T>(view: T): Result<T> {
  return { ok: true, view };
}

export function fail(error: ErrorCode): Result<never> {
  return { ok: false, error };
}

export const STATUS: Record<ErrorCode, number> = {
  "invalid-body": 400,
  "not-adjacent": 400,
  "invalid-target": 400,
  "link-and-file": 400,
  "public-needs-link": 400,
  "no-file": 400,
  "root-folder": 400,
  forbidden: 403,
  "not-found": 404,
  "folder-exists": 409,
  "folder-not-empty": 409,
  "file-pending": 409,
  "file-uploaded": 409,
};

export function respond<T>(result: Result<T>): JsonResult {
  return result.ok ? json(200, result.view) : json(STATUS[result.error], { error: result.error });
}
