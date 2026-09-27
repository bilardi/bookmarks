# Deployment

Putting the system on AWS and taking it away again. Preparing an account for the first time, the Google client included, is described in [SETUP.md](SETUP.md), and it is done once. What follows is done again every time something changes in `core/`, `backend/` or the templates in `sam/`.

## The one command

The whole thing is one SAM stack of four nested ones, data, identity, backend and site, deployed from the repository root with the AWS profile and the curator exported in the shell:

```sh
export AWS_PROFILE=<profile>
export CURATOR_EMAIL=<the address>
make deploy
```

That single command does four things in order:

1. it reads the S3 prices from the AWS Pricing API, which the page of the usage shows beside the bytes
2. it reads the Google credentials from Parameter Store
3. it applies the stacks twice: the second pass hands Cognito and the API the address of the distribution that the first pass created
4. it runs the checks

The prices come first on purpose. If the Pricing API does not return one of them, because AWS renamed a usage type or answers with two products where one is expected, the command stops with the name of the missing price and deploys nothing: the stack keeps the prices it had, and a cost is never shown as zero. How the prices are read is in `backend/src/pricing.ts`, and they can be read alone with `make prices`.

The second pass exists because the site depends on the API, the API on the pool, and the pool needs the address of the site: written as one dependency it would be a circle, so it is closed afterwards instead. On later runs it finds nothing to change. Each pass asks to confirm its change set before applying it.

After it, the site answers on the address CloudFront gives it, of the form `https://abc123abc123ab.cloudfront.net`: it is the `SiteUrl` that `make outputs` prints, and the one to use until the site has an address of its own.

## An address of its own

This comes after the first `make deploy`, and it is optional: until it is done, the site answers on the address CloudFront gives it, and works the same. Giving it a name needs a certificate, and the certificate is a stack apart, `bookmarks-certificate`, deployed to us-east-1, because CloudFront takes a certificate only from that region and CloudFormation creates nothing outside the region of its own stack. There is no Route 53 zone: the two DNS records it takes are written by hand in the DNS of the parent domain, and the zone would be the only thing in the project with a monthly fee. The certificate costs nothing.

The certificate is validated over DNS, and the stack waits until the record is there:

```sh
export AWS_PROFILE=<profile>
make deploy-certificate
```

While it waits, in another shell, the record to write:

```sh
export AWS_PROFILE=<profile>
make certificate-record
```

It prints a CNAME record, a name and a value, which goes into the DNS of `bilardi.net`. Once public DNS answers with it, ACM validates the certificate and the stack completes. The record stays there for good: ACM renews the certificate by itself as long as it finds it.

Then the deploy carries the site onto the name:

```sh
make deploy
```

**`make deploy` reads the certificate stack every time.** If it finds a certificate it gives the distribution the address and the certificate; if it finds none, it says so and leaves the site where CloudFront put it. So a plain deploy months later cannot take the site off its own address by failing to mention it.

It ends by printing the second record: the address of the site as a CNAME to the host name of the distribution. That one also goes into the DNS of `bilardi.net`, and from then on the site answers on its name. The address CloudFront gives keeps answering beside it, and the login accepts both.

## The checks

`make check-deployed` runs at the end of every deploy, and on its own whenever it is worth knowing the published system still holds. It writes nothing:

| Check | What it proves |
|---|---|
| the API answers through CloudFront, asking for a token | the `/api` prefix is removed, the route matched, and the authorizer is in front of it |
| the API asks for a token when called directly too | the authorizer does not depend on CloudFront |
| an unknown API route stays a 404 | what the API refuses arrives as the API said it, because the pages read those codes |
| the login page sends the browser to Google | the pool, its domain, the client and its callback agree |
| the pages forbid being framed, run only the code of the bundle, may reach Cognito | the security policy is on the pages, with the origins the login needs |
| the pages ask for HTTPS from now on, forbid guessing types | the other security headers are on the pages |
| the files cannot be read anonymously | the content bucket is private |
| an expired signed URL is refused | a link to a file stops working when it expires |

The login itself needs a person and a Google account, so it is checked by hand, as [SETUP.md](SETUP.md) describes.

## The other commands

| Command | What it does |
|---|---|
| `make outputs` | the addresses of what is deployed, the site and the login page included |
| `make prices` | the S3 prices as the deploy would read them, writing nothing |

## Taking it away

```sh
export AWS_PROFILE=<profile>
make destroy
```

It asks first, and nothing is deleted until the name of the stack is typed:

```
This deletes the site and the files of every user, and the files cannot be recovered.
Type the name of the stack (bookmarks) to go on:
```

Then it empties the two buckets, because CloudFormation refuses to delete a bucket that still holds objects, and deletes the stack. **It takes the data with it**: the bookmarks of every user live in the DynamoDB table, and their files in the content bucket, which keeps no earlier versions. What survives is what never belonged to the stack: the Google credentials in Parameter Store, and the certificate stack.

The certificate comes away on its own, and without touching the site or the data:

```sh
make destroy-certificate
```

ACM refuses to delete a certificate that a distribution is still presenting, so the command first runs `make deploy DOMAIN=off`, which takes the name off the site and leaves it on the address CloudFront gives, and only then deletes the certificate stack. The two records in the DNS of `bilardi.net` stay behind, and they are removed by hand: the name of the site still points at the distribution, which no longer answers on it, and the validation record validates nothing.

## When the first deploy fails

A deploy that fails while creating the stack for the first time leaves it in `ROLLBACK_COMPLETE`, an empty shell that CloudFormation refuses to update: the next `make deploy` stops on the same state instead of retrying. The way out is deleting it, and waiting:

```sh
export AWS_PROFILE=<profile>
aws cloudformation delete-stack --stack-name bookmarks --region eu-west-1
aws cloudformation wait stack-delete-complete --stack-name bookmarks --region eu-west-1
make deploy
```

This is only about the very first creation. Once the stack exists, a failed deploy rolls back to the previous version and the next one starts from there.
