# Deployment

Putting the system on AWS and taking it away again. Preparing an account once, the Google client included, is in [SETUP.md](SETUP.md).

## The one command

The whole thing is one SAM stack of four nested ones, data, identity, backend and site, deployed from the repository root with the AWS profile and the curator exported in the shell:

```sh
export AWS_PROFILE=<profile>
export CURATOR_EMAIL=<the address>
make deploy
```

That one command reads the S3 prices, applies the stacks, builds the site with the identity of the pool and uploads it, and checks the result. It runs again after every change to `core/`, `backend/`, `frontend/` or `sam/`; a change to the pages alone has `make deploy-site`, which takes seconds instead of minutes.

In detail:

- **The prices come first**: if the Pricing API does not return one of them, the command stops with its name and deploys nothing, so a cost is never shown as zero. `make prices` reads them alone
- **The stacks are applied twice**: the pool needs the address of the site, which exists only after the first pass, so the second one hands it over. On later runs it finds nothing to change
- **The site answers on the address CloudFront gives**, of the form `https://abc123abc123ab.cloudfront.net`, until it has one of its own: `make outputs` prints it as `SiteUrl`

The variables of the Makefile:

| Variable | Default | Alternatives | What it controls |
|---|---|---|---|
| `CURATOR_EMAIL` | none, required to deploy and to import | the Google address of whoever deploys | who enters without an invitation, publishes, and owns what is imported |
| `REGION` | `eu-west-1` | any region with Cognito and HTTP API | where the stack lives |
| `GOOGLE_CLIENT` | `/google-client/bookmarks` | any path in Parameter Store | where the deploy reads the Google credentials |
| `SITE_DOMAIN` | `bookmarks.alessandra.bilardi.net` | any name of a domain you control | the address the certificate is asked for |
| `DOMAIN` | unset | `off` | `off` takes the address of its own away from the site, back on the one CloudFront gives |

The other commands of the deploy:

| Command | What it does |
|---|---|
| `make deploy-site` | rebuilds and uploads the site alone, and invalidates the cache: seconds instead of minutes when only the pages changed |
| `make outputs` | the addresses of what is deployed, the site and the login page included |
| `make prices` | the S3 prices as the deploy would read them, writing nothing |
| `make check-deployed` | the checks below, on their own, writing nothing |

`make deploy-site` reads the outputs of the stack every time: the build is static, so the identity of the pool is baked into it, and a new pool means a new build.

Once deployed, the curator invites, bans and reads the usage of everybody with the commands in the section "The curator" of the [README](../README.md#the-curator).

## An address of its own

Optional, and after the first deploy. The certificate is a stack apart in us-east-1, the only region CloudFront takes one from, and it is free; there is no Route 53 zone, so its two DNS records are written by hand in the DNS of the parent domain.

```sh
export AWS_PROFILE=<profile>
make deploy-certificate  # waits until the certificate is validated
make certificate-record  # in another shell, with AWS_PROFILE exported too: the CNAME record that validates it
make deploy  # carries the site onto the name, and prints the second CNAME
```

The validation record stays in the DNS for good, because ACM renews the certificate as long as it finds it. The second record points the name of the site at the distribution. `make deploy` reads the certificate stack every time, so a later deploy never takes the site off its name by forgetting it.

## The checks

`make check-deployed` runs at the end of every deploy, and on its own when needed. It writes nothing:

| Check | What it proves |
|---|---|
| the site is served | the page is in the bucket, and only the distribution reads it |
| a route of the app falls back to the page | an address like `/my/lessons` is served with the page, not as a missing file |
| the public page is served without a login | `/public` is open to everybody |
| the public bookmarks answer without a login | the public route has no authorizer, and CloudFront reaches it |
| the public bookmarks come from the cache | CloudFront keeps the public answer five minutes |
| the API answers through CloudFront, asking for a token | the `/api` prefix is removed, the route matched, and the authorizer is in front of it |
| the API asks for a token when called directly too | the authorizer does not depend on CloudFront |
| an unknown API route stays a 404 | what the API refuses arrives as the API said it |
| the login page sends the browser to Google | the pool, its domain, the client and its callback agree |
| the pages forbid being framed, run only the code of the bundle, may reach Cognito | the security policy is on the pages |
| the pages ask for HTTPS from now on, forbid guessing types | the other security headers are on the pages |
| the files cannot be read anonymously | the content bucket is private |
| an expired signed URL is refused | a link to a file stops working when it expires |

The login itself needs a person and a Google account, so it is checked by hand, as [SETUP.md](SETUP.md) describes.

## Taking it away

```sh
export AWS_PROFILE=<profile>
make destroy
```

It asks for the name of the stack before deleting anything, then empties the two buckets and deletes the stack. **It takes the data with it**: the bookmarks of every user and their files. What survives is what never belonged to the stack: the Google credentials in Parameter Store, and the certificate stack.

The certificate comes away on its own with `make destroy-certificate`, which first takes the name off the site with `make deploy DOMAIN=off`, because ACM refuses to delete a certificate still in use. The two DNS records are then removed by hand.

## When the first deploy fails

A first deploy that fails leaves the stack in `ROLLBACK_COMPLETE`, which CloudFormation refuses to update. The way out is deleting it:

```sh
export AWS_PROFILE=<profile>
aws cloudformation delete-stack --stack-name bookmarks --region eu-west-1
aws cloudformation wait stack-delete-complete --stack-name bookmarks --region eu-west-1
make deploy
```

Once the stack exists, a failed deploy rolls back to the previous version by itself.
