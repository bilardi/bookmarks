#!/bin/sh
# Runs the API checks against the local system, starting what is missing and
# leaving running what was already there. Usage: bash local/api-check.sh

set -e

cd "$(dirname "$0")/.."

API_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
DYNAMODB_URL="${DYNAMODB_LOCAL_URL:-http://127.0.0.1:8000}"
SAM_LOG="${SAM_LOG:-/tmp/bookmarks-sam-local.log}"
started_sam=""

# Any answer means the port is serving. The API root is not a route, so sam local
# replies at once instead of starting a container, which the first real call does.
up() {
    curl -s -o /dev/null --max-time 3 "$1" && return 0
    return 1
}

wait_for() {
    i=0
    while [ "$i" -lt 60 ]; do
        if up "$1"; then
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done
    echo "--> giving up waiting for $1"
    return 1
}

stop_sam() {
    if [ -n "$started_sam" ]; then
        echo "--> stopping the API started here"
        kill "$started_sam" 2>/dev/null || true
    fi
}
trap stop_sam EXIT

# DynamoDB Local answers 400 to a plain GET, which is enough to know it is there.
if up "$DYNAMODB_URL"; then
    echo "--> DynamoDB Local already up"
else
    echo "--> starting DynamoDB Local"
    docker compose -f local/docker-compose.yml up -d
    wait_for "$DYNAMODB_URL"
fi

echo "--> bundling the Lambda functions"
make local-bundles >/dev/null

if up "$API_URL/"; then
    echo "--> API already up, using it"
else
    echo "--> starting the API, log in $SAM_LOG"
    sam local start-api --docker-network bookmarks_default --env-vars local/env.json \
        >"$SAM_LOG" 2>&1 &
    started_sam=$!
    wait_for "$API_URL/"
fi

echo "--> running the checks"
cd backend
API_BASE_URL="$API_URL" npx -y tsx scripts/api-check.ts
