# Setup

One-time preparation of an AWS account for this project, needed only to deploy: running the API locally needs none of it.

## What you need

- an AWS account, and the AWS CLI configured with a profile for it
- a Google project for the OAuth consent screen, the one aws-card-clash describes in its own setup, with a client of its own for this site
- access to the DNS of the parent domain, only to give the site an address of its own

## Names on AWS

Everything carries the same prefix, so the console can be filtered by it:

| Object | Name |
|---|---|
| CloudFormation stack | `bookmarks` |
| DynamoDB table | `bookmarks` |
| Cognito user pool | `bookmarks` |
| Cognito app client | `bookmarks-web` |
| Cognito domain | `bookmarks.auth.eu-west-1.amazoncognito.com` |
| CloudFront distribution | comment `bookmarks` |
| CloudFront functions | `bookmarks-strip-api-prefix`, `bookmarks-app-routes` |
| CloudFront response headers policy | `bookmarks-security-headers` |
| Certificate stack, in us-east-1 | `bookmarks-certificate` |
| SSM parameters | `/google-client/bookmarks/id`, `/google-client/bookmarks/secret` |

Lambda functions, IAM roles, the nested stacks and the two buckets, the site and the files, are named by CloudFormation, which prefixes them with the stack name. Everything lives in `eu-west-1`, except the certificate, which CloudFront takes only from `us-east-1`.

## Preparation

### Point the shell at the account

The profile is exported once per shell session, and every command below inherits it:

```sh
aws configure list-profiles
export AWS_PROFILE=<profile>
aws sts get-caller-identity
```

The last command prints the account the deploy will write into: check it is the one you mean before going on.

### Check the Cognito domain is free

The domain prefix is global to the region, so somebody else can have taken it:

```sh
aws cognito-idp describe-user-pool-domain --domain bookmarks --region eu-west-1
# {
#     "DomainDescription": {}
# }
```

An empty description means the prefix is free. If it comes back filled, pick another prefix and use it consistently in the Google client and as `CognitoDomainPrefix` in `template.yaml`. A prefix carrying the text `aws`, `amazon` or `cognito` is refused anyway, whatever the availability says.

### The Google client

The consent screen, its publishing status and its scopes belong to the Google project, and they serve every site of that project. The client is one per site, so that revoking or rotating it stops this site and nothing else.

At <https://console.cloud.google.com/auth/clients>, with the project selected, press **Create client** and fill it in:

| Field | Value |
|---|---|
| Application type | Web application |
| Name | `bookmarks` |
| Authorized JavaScript origins | `https://bookmarks.auth.eu-west-1.amazoncognito.com` |
| Authorized redirect URIs | `https://bookmarks.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse` |

The redirect URI is where Google sends the browser back, and Cognito serves that path itself: it has to match the Cognito domain exactly. The consent screen then reads "to continue to bookmarks.auth.eu-west-1.amazoncognito.com", because Google names the domain of the redirect URI.

### Store the Google credentials

```sh
aws ssm put-parameter --name /google-client/bookmarks/id \
  --value '<the client ID from Google>' --type String --region eu-west-1
aws ssm put-parameter --name /google-client/bookmarks/secret \
  --value '<the secret from Google>' --type SecureString --region eu-west-1
```

Both values are read from here by `make deploy` and handed to the template as parameters, for the reasons aws-card-clash gives in its setup: the secure string cannot be resolved by a Cognito property, and a plain parameter inside a nested stack is reread only when that stack changes. The path can be another one, given as `GOOGLE_CLIENT` on the command line of the deploy.

Paste each value on a single line. A newline slipped into the client ID is invisible in every listing, and comes back from Google as `The OAuth client was not found`. Counting the characters is how it shows:

```sh
aws ssm get-parameter --name /google-client/bookmarks/id \
  --query Parameter.Value --output text --region eu-west-1 | wc -c
# 73
aws ssm get-parameter --name /google-client/bookmarks/secret --with-decryption \
  --query Parameter.Value --output text --region eu-west-1 | wc -c
# 36
```

Each count is the length of the value plus the newline the command adds: 72 characters of client ID and 35 of secret, for a Google web client. Anything longer carries something that should not be there, and `--overwrite` on the same command replaces it.

### The curator

The curator is whoever deploys, named by the email address of their Google account. It is the one address let in without an invitation, and it is never written in the repository: the deploy reads it from the shell.

```sh
export CURATOR_EMAIL=<the address>
```

## Check the login works

After the first deploy, and after every change to the Google client: it exercises the whole chain, Cognito, Google, the invitation trigger and the API, without the pages.

The stack outputs carry every address it needs:

```sh
make outputs
```

Then the login page, opened in the browser with the client id of the outputs:

```sh
UserPoolClientId=<UserPoolClientId>
echo "https://bookmarks.auth.eu-west-1.amazoncognito.com/login?response_type=code&client_id=$UserPoolClientId&redirect_uri=http://localhost:5173&scope=openid+email+profile"
```

Google is the only provider, so the page goes straight there. Sign in with the curator address. Signing in ends on `http://localhost:5173/?code=...`, which does not load: nothing listens on that address, and the code in the address bar is the point of the exercise.

The code becomes tokens, once and within five minutes:

```sh
UserPoolClientId=<UserPoolClientId>
code=<the code>
curl -s -X POST https://bookmarks.auth.eu-west-1.amazoncognito.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=authorization_code -d client_id=$UserPoolClientId \
  -d code=$code -d redirect_uri=http://localhost:5173 > /tmp/token.json
```

An `invalid_grant` here means the code has expired or has already been spent: sign in again and take the new one.

The id token is what the API trusts, and the profile comes back through the site:

```sh
SiteUrl=<SiteUrl>
ID_TOKEN=$(python3 -c "import json; print(json.load(open('/tmp/token.json'))['id_token'])")
curl -s -H "authorization: Bearer $ID_TOKEN" $SiteUrl/api/me
# {"userId":"...","name":"...","email":"<the curator address>","curator":true}
```

`"curator": true` proves the address given at the deploy reached the functions.

The refusal, too: the same login page in a private window, with a Google account whose address is not invited. Cognito calls the invitation trigger before creating the user, the trigger refuses, no user is created, and the browser ends on `http://localhost:5173/?error_description=PreSignUp+failed+with+error+not-invited.+&error=invalid_request`.

The check ends by throwing the tokens away: the id token lives fifteen minutes and the refresh one an hour, but `/tmp/token.json` is a credential until it is deleted.

```sh
rm /tmp/token.json
```

Once the account is prepared, deploying is described in [DEPLOYMENT.md](DEPLOYMENT.md).
