// Limits shared by the pages and the API. The text of an item and the note of a
// view are meant as annotations, hence the 250 characters.
export const TEXT_MAX = 250;
export const TITLE_MAX = 200;
export const NAME_MAX = 255;

// One write moves the counters of every folder above the item and of every tag on
// it, in one transaction of at most 100 operations. Ten tags and ten levels keep
// the worst case, a move to another folder that also replaces every tag, at 64.
export const TAGS_MAX = 10;
export const PATH_DEPTH_MAX = 10;
export const SEGMENT_MAX = 64;
