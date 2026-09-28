#!/bin/sh
# Checks the deployed system without writing anything: the site is served and its
# routes fall back to the page, the API is behind the authorizer through CloudFront
# and directly, the login page reaches Google, the pages carry the security headers,
# and the files cannot be read without a signed URL. Usage: bash scripts/deployed-check.sh

set -e

cd "$(dirname "$0")/.."

STACK="${STACK:-bookmarks}"
REGION="${REGION:-eu-west-1}"

OUTPUTS="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text || true)"

output() {
    echo "$OUTPUTS" | awk -v key="$1" '$1 == key { print $2 }'
}

SITE="$(output SiteUrl)"
API="$(output ApiUrl)"
LOGIN="$(output HostedUiDomain)"
CLIENT="$(output UserPoolClientId)"
CONTENT="$(output ContentBucketName)"

if [ -z "$SITE" ] || [ -z "$API" ] || [ -z "$LOGIN" ] || [ -z "$CLIENT" ] || [ -z "$CONTENT" ]; then
    echo "no outputs from the stack $STACK in $REGION: check the profile, or deploy first"
    exit 1
fi

failures=0

check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        failures=$((failures + 1))
        echo "FAIL $1 -> expected $2, got $3"
    fi
}

contains() {
    case "$3" in
        *"$2"*) echo "ok   $1" ;;
        *) failures=$((failures + 1)); echo "FAIL $1 -> no \"$2\" in: $3" ;;
    esac
}

status() {
    curl -s -o /dev/null -w "%{http_code}" "$@"
}

echo "checking $SITE"
echo ""

check "the site is served" 200 "$(status "$SITE/")"
check "a route of the app falls back to the page" 200 "$(status "$SITE/my/lessons")"
check "the API answers through CloudFront, asking for a token" 401 "$(status "$SITE/api/me")"
check "the API asks for a token when called directly too" 401 "$(status "$API/me")"
check "an unknown API route stays a 404" 404 "$(status "$SITE/api/nothing-here")"
# One provider only, so the authorization sends the browser straight to Google.
check "the login page sends the browser to Google" 302 \
    "$(status "$LOGIN/oauth2/authorize?client_id=$CLIENT&response_type=code&scope=openid&redirect_uri=$SITE")"

# Header names ignore case, and each version of HTTP writes them its own way:
# lowercased here, they read the same over both.
PAGE_HEADERS="$(curl -s -o /dev/null -D - "$SITE/" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
contains "the pages forbid being framed" "frame-ancestors 'none'" "$PAGE_HEADERS"
contains "the pages run only the code of the bundle" "script-src 'self';" "$PAGE_HEADERS"
contains "the pages may reach Cognito" "$LOGIN" "$PAGE_HEADERS"
contains "the pages ask for HTTPS from now on" "strict-transport-security:" "$PAGE_HEADERS"
contains "the pages forbid guessing types" "x-content-type-options: nosniff" "$PAGE_HEADERS"

FILES="https://$CONTENT.s3.$REGION.amazonaws.com"
check "the files cannot be read anonymously" 403 "$(status "$FILES/files/nothing")"
# Signing is local and writes nothing; the second of waiting makes it expire.
EXPIRED="$(aws s3 presign "s3://$CONTENT/files/nothing" --expires-in 1 --region "$REGION")"
sleep 2
check "an expired signed URL is refused" 403 "$(status "$EXPIRED")"

echo ""
if [ "$failures" -eq 0 ]; then
    echo "all checks passed"
else
    echo "$failures check(s) failed"
    exit 1
fi
