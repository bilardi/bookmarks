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
| `SITE_DOMAIN` | `bookmarks.bilardi.net` | any name of a domain you control | the address the certificate is asked for |
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

Optional, and after the first deploy. The certificate is a stack apart in us-east-1, the only region CloudFront takes one from, and it is free. There is no Route 53 zone: two CNAME records are written by hand in the DNS of the parent domain, `bilardi.net`, next to its other records. The nameservers of the domain do not change.

| Record | Name | Target | What it is for |
|---|---|---|---|
| validation | `_<prefix>.bookmarks.bilardi.net` | `_<value>.acm-validations.aws` | proves to ACM that the domain is yours, now and at every renewal |
| site | `bookmarks.bilardi.net` | the host name of the distribution, like `d1jws8nweu9u74.cloudfront.net` | sends whoever opens the name to CloudFront |

Both stay in the DNS for good.

### Before the certificate: the CAA records

A CAA record says which authorities may issue certificates for a name, and ACM follows it: the name, and then each domain above it, following any CNAME. None of them may exclude Amazon:

```sh
dig +short CAA bookmarks.bilardi.net
dig +short CAA bilardi.net
```

Both answer nothing, so any authority may issue. A name under a domain that is itself a CNAME to another service inherits the CAA records of that service: under `alessandra.bilardi.net`, a CNAME to GitHub Pages, only Let's Encrypt, DigiCert and Sectigo may issue, and ACM never does. That is why the site is `bookmarks.bilardi.net`.

### The certificate

```sh
export AWS_PROFILE=<profile>
make deploy-certificate  # waits until the certificate is issued
```

In another shell, with `AWS_PROFILE` exported too, the validation record:

```sh
make certificate-record
```

It prints the name and the value of the record. In a DNS panel that asks for a subdomain, a target and a TTL:

- **Subdomain**: the name without `.bilardi.net.`, like `_1878da59b13307f1252ac7e67413e4b8.bookmarks`, because the panel adds the domain by itself
- **Target**: the value as printed, the final dot included or left out, as the panel accepts it
- **TTL**: the default

The record is visible to everybody when a public resolver answers it:

```sh
dig +short CNAME _<prefix>.bookmarks.bilardi.net @8.8.8.8
```

And ACM says where it is, `PENDING_VALIDATION` until it finds the record and `ISSUED` after; usually minutes, and ACM waits up to 72 hours:

```sh
aws acm list-certificates --region us-east-1 --certificate-statuses PENDING_VALIDATION ISSUED \
  --query "CertificateSummaryList[?DomainName=='bookmarks.bilardi.net'].[Status]" --output text
```

At `ISSUED`, `make deploy-certificate` ends by itself.

### The site on its name

```sh
make deploy
```

`make deploy` finds the certificate, gives the distribution the name, adds it to the addresses of the login, and prints the site record: the name as a CNAME to the host name of the distribution. In the panel:

- **Subdomain**: `bookmarks`
- **Target**: the host name printed, like `d1jws8nweu9u74.cloudfront.net.`
- **TTL**: the default

The checks at the end of that deploy fail with `000` until the record exists. Once it answers:

```sh
dig +short CNAME bookmarks.bilardi.net  # the host name of the distribution
make check-deployed
```

If `dig` answers and the checks still fail with `000`, and `curl -v https://bookmarks.bilardi.net` says `Could not resolve host`, the resolver of the computer asked for the name before the record existed and keeps the answer "no such name" for a while. Emptying its cache ends the wait:

```sh
resolvectl flush-caches  # systemd-resolved, as on Fedora and Ubuntu
make check-deployed
```

`make deploy` reads the certificate stack every time, so a later deploy never takes the site off its name by forgetting it. The address CloudFront gives keeps answering beside the name, and the login accepts both.

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
