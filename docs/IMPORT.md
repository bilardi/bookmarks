# Import

Loading many bookmarks at once, from a CSV file: the public links, a course of lessons with its files, or anything else the pages can create one by one. The import writes as the curator, the person named by `CURATOR_EMAIL`, so everything it creates belongs to them. It needs the system deployed, as [DEPLOYMENT.md](DEPLOYMENT.md) describes.

## The CSV file

The first line names the columns, and only the columns named there are read: a file for the public links and a file for a course carry different columns. A column that is not in the table below stops the import before anything is written.

| Column | Required | What it holds |
|---|---|---|
| `title` | yes | the title |
| `link` | no | the web address, starting with `http://` or `https://` |
| `file` | no | the file already uploaded under `import/`, see below |
| `text` | no | the text, at most 250 characters |
| `path` | no | the folder, like `lessons/english/basic`; empty is the root |
| `tags` | no | the tags, separated by spaces: a tag carries none, and joins its words with a hyphen, like `machine-learning` |
| `shared` | no | `true` or `false`, `false` when empty |
| `published` | no | `true` or `false`, `false` when empty; only on a row with a link |
| `seen` | no | `true` or `false`, `false` when empty: the eye of the curator on the item |
| `flag` | no | `true` or `false`, `false` when empty: the red flag of the curator |
| `note` | no | the personal note of the curator, at most 250 characters |

Each row follows the same rules as the form of the pages: a row carries a link or a file, not both; without either it is a note; a published row is also shared. A value holding a comma goes between double quotes, and a double quote inside it is written twice.

The last three are the personal view, the one each person keeps on every item they can read: an import writes it only for the rows it creates, so a note changed in the pages after a first import stays as it is when the same file runs again.

The public links:

```csv
title,link,tags,published
Git in nuts,https://git-scm.com/,bash linux versioning,true
"Tmux, the tips",https://github.com/tmux/tmux/wiki,bash linux,true
```

A course, with its files:

```csv
title,file,path,tags,shared
Lesson 1,english/basic/01.mp3,lessons/english/basic,lessons english basic,true
Lesson 2,english/basic/02.mp3,lessons/english/basic,lessons english basic,true
Exercises,english/basic/exercises.pdf,lessons/english/basic,lessons english basic,true
```

The rows enter their folder in the order of the file, after what the folder already holds: the order of the file is the order of the course.

## The files

The files go into the content bucket first, under the prefix `import/`, and the column `file` names each one by its path after that prefix. Uploading a folder keeps its structure, so the path is the one on the computer, inside that folder:

```sh
export AWS_PROFILE=<profile>
BUCKET=$(aws cloudformation describe-stacks --stack-name bookmarks --region eu-west-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" --output text)
aws s3 sync ./course s3://$BUCKET/import/
aws s3 ls s3://$BUCKET/import/ --recursive
```

`BUCKET` is the content bucket, the one of the files: the stack has a second one, `BucketName`, which holds the pages and is emptied of anything else at every upload of the site, so a file put there is lost. With `./course/english/basic/01.mp3` uploaded this way, the object is `import/english/basic/01.mp3`, and the column `file` holds `english/basic/01.mp3`. `sync` uploads only what is not there yet, so an upload cut halfway through goes on from where it stopped when it runs again.

`sync` takes a folder, not a file: given a file, it looks for a folder by that name and skips it. A single file goes with `cp`, and the key written out in full:

```sh
aws s3 cp ./test.mp4 s3://$BUCKET/import/test.mp4
```

The column `file` then holds `test.mp4`.

For each row with a file, the import creates the item and then moves the object, inside S3, to the key of that item, in the Intelligent-Tiering storage class: nothing travels through the computer. The copy is what S3 announces as a new object, and the function that follows every upload marks the file as ready and adds its size to the usage of the curator, as for a file uploaded from the pages. The type of the file is the one S3 recorded at the upload, which `aws s3 sync` guesses from the extension.

**Each original leaves `import/` as soon as its copy is there**, with the same size: the import copies, checks the copy, and only then deletes the original. No file is paid for twice, and nothing is left to clean up. When the check fails, the original stays where it is and the import stops on that row. At the end `import/` holds only what the file did not name.

## Running it

```sh
export AWS_PROFILE=<profile>
export CURATOR_EMAIL=<the address>
make import CSV=path/to/the/file.csv
```

The CSV file stays on the computer: only the files go to S3. The curator must have signed in at least once, because the import needs the identity Cognito gave them at the first login.

The import reads the whole file before writing anything. A row that is not valid, a column that is not known, or a file missing under `import/` stops it, with the number of each row and the reason, and nothing is created.

A row with the same title as an item already in the same folder is skipped, and the import says so. Running the same file again after an interruption therefore creates only what was missing, and never a second copy. So two different items in the same folder need two different titles.

A skipped row needs no file under `import/`, since its file was moved the first time. The one exception is an item whose file never arrived, because the run was cut between creating it and moving its file: that file is looked for under `import/` again, and moved.

It ends by counting what it did:

```
created 12, skipped 3
```
