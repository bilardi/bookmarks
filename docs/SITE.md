# The site

What a person sees, what the API answers behind it, and the rules the items follow. It is the same site locally and deployed: locally there is no login, and the pages act as one fixed person.

## The pages

The browser shows five kinds of page, and the rest is state inside the page:

- `/` and `/my/<folder>`: the own bookmarks, one folder at a time, with its subfolders above the items
- `/shared`: the people who share something with everybody invited, and `/shared/<person>/<folder>` their shared bookmarks, folder by folder
- `/usage`: the traffic and the storage of the person, month by month, with their costs
- `/public`: the links the curator published, for everybody and without a login; the logout lands here
- `?tags=a,b` on the pages of the bookmarks: the items with every one of those tags, in the folder of the page and in its subfolders; at the root, everywhere

Each row carries, from the left: the eye (seen), the red flag, the text, then the title. The **Edit** button beside the folders shows two more icons on every row, the arrows that move the item up and down in its folder before the eye, and the pencil that changes the item after the text, and turns into **Done** to hide them again: on a phone they would take half the row. An icon that cannot be used stays in its place, turned off, so the rows stay aligned. A long title wraps beside the icons, never under them. The title of a link opens it in another tab; the title of a file opens it in the page, when the browser can show it, or downloads it with its own name. The tags are not on the rows: they are in the bar above.

The bar above the list shows the tags of what is in the folder and in its subfolders, and they are ordered and colored as in bookmarks-v3.0: by how many other tags appear with each one, not by how many items carry it.

| Other tags it appears with | Color |
|---|---|
| none | grey |
| 1 | white |
| 2 | blue |
| 3 | green |
| 4 | light blue |
| 5 or more | orange |

A tag on many items, but always alone, is grey; a tag on one item with three others is green. Every tag is a button, and darkens under the pointer. Selecting one narrows the list and the bar together, and the selected tag turns red. The colors stay the same in every folder and while the bar narrows, because they come from everything the person can read.

The public page has no icons and no menu: the title of each link, the tags to narrow them, and a button to log in.

## The items

- **Three kinds**: a link, a file on S3, or a note, which is an item with neither. A link and a file do not go together
- **The title**: required, at most 200 characters
- **The text**: optional, at most 250 characters, meant as an annotation
- **One folder per item**, which holds its order: the arrows move an item past its neighbor in the same folder, and with a tag filter on they stop at the edge of its folder. Folders nest up to ten levels
- **Up to ten tags per item**. Folder names and tags follow one rule: lowercase letters, digits, `-` and `_`, at most 64 characters, so they can always be written in an address as they are. Capitals are lowered when saved
- **The personal view**: each person keeps their own seen, flag and note, of at most 250 characters, on every item they can read, their own and the shared ones alike. Nobody else sees it
- **Sharing**: an item is shared with everybody invited, or with nobody; a whole folder can be shared or unshared at once
- **Publishing**: only the curator publishes, and only links. A published item is also shared, and taking the sharing away, of the item or of its folder, takes the publication away
- **The file** of an item is uploaded once, at its creation, up to the size the deploy allows, 200 MB by default

## The API

Behind those pages there is one HTTP API. Deployed, it answers under `/api` on the distribution; on the machine it answers on `127.0.0.1:3000`, and under `/api` through the Vite development server. Every route needs a token, except the public one. `owner` in a query names the person whose bookmarks are read; left out, it is the caller.

| Route | What it does |
|---|---|
| `GET /me` | the caller, and whether they are the curator; the first call also creates their profile |
| `GET /me/usage` | the traffic of the caller by month and their storage, with the costs when the deploy read the prices |
| `GET /owners` | the people who share something, except the caller |
| `GET /tags?owner=&path=` | the tags of what is under the folder, with how many items carry each and how many other tags appear with it over everything readable; others see only the shared ones |
| `GET /folders?owner=&path=` | the subfolders of a folder, or, without `path`, every folder of the owner |
| `POST /folders` | a new folder |
| `PATCH /folders` | a folder renamed or moved, with everything inside it |
| `PUT /folders/share` | a folder and everything inside it, shared or unshared |
| `DELETE /folders?path=` | an empty folder deleted |
| `GET /items?owner=&path=` | the items of a folder, in their order, each with the personal view of the caller |
| `GET /items?owner=&path=&tags=` | the items with every one of the tags, under the folder |
| `POST /items` | a new item, at the end of its folder |
| `PATCH /items/{id}` | an item changed: title, text, link, folder, tags, sharing, publication |
| `DELETE /items/{id}` | an item deleted, its file with it |
| `POST /items/{id}/move` | an item moved past its neighbor, up or down |
| `PUT /items/{id}/view` | the personal view of the caller on an item |
| `POST /items/{id}/upload` | a URL signed for fifteen minutes, to upload the file of a new item |
| `GET /items/{id}/download` | a URL signed for an hour, to open the file of an item |
| `GET /public/items` | the published links, with title, link and tags only; no token, and CloudFront keeps the answer five minutes |

Writes address the own items only: the item of somebody else is simply not there. What the API refuses comes back as `{ "error": "<code>" }`, and the pages say it in words next to the action refused:

| Code | Status | When |
|---|---|---|
| `invalid-body` | 400 | what was sent does not follow the schema |
| `link-and-file` | 400 | an item with a link and a file together |
| `public-needs-link` | 400 | a publication of an item without a link |
| `not-adjacent` | 400 | a move past an item that is not the neighbor in the same folder |
| `invalid-target` | 400 | a folder moved inside itself |
| `no-file` | 400 | an upload or a download on an item without a file |
| `root-folder` | 400 | a change to the root folder |
| `forbidden` | 403 | an item not shared with the caller, or a publication by somebody but the curator |
| `not-found` | 404 | nothing there, or nothing there for the caller |
| `folder-exists` | 409 | a folder with that name already there |
| `folder-not-empty` | 409 | a folder deleted while it still holds something |
| `file-pending` | 409 | a download before the file has arrived |
| `file-uploaded` | 409 | a second upload of the same file |

How many items a folder holds, and how many of them are shared, is kept on write, in the same transaction as the item. The tags of a folder, their counts and their colors are counted from the items the caller can read, at each request.
