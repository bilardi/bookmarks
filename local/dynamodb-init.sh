#!/bin/sh

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-fake}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-fake}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export DYNAMODB_ENDPOINT_URL="${DYNAMODB_ENDPOINT_URL:-http://dynamodb:8000}"

wait_dynamo() {
    while ! aws dynamodb list-tables --endpoint-url "$DYNAMODB_ENDPOINT_URL" --no-cli-pager; do
        echo "waiting for DynamoDB"
        sleep 3
    done
}

create_tables() {
    for table_file in *.json; do
        table_name=$(sed -n 's/.*"TableName": *"\([^"]*\)".*/\1/p' "$table_file")
        if aws dynamodb describe-table --table-name "$table_name" --endpoint-url "$DYNAMODB_ENDPOINT_URL" --no-cli-pager >/dev/null 2>&1; then
            echo "--> Table \"$table_name\" already exists, deleting it"
            aws dynamodb delete-table --table-name "$table_name" --endpoint-url "$DYNAMODB_ENDPOINT_URL" --output text --no-cli-pager
        fi
        echo "--> Creating \"$table_name\" table"
        aws dynamodb create-table --cli-input-json "file://./$table_file" --endpoint-url "$DYNAMODB_ENDPOINT_URL" --output text --no-cli-pager
    done
}

cd "$(dirname "$0")"
wait_dynamo && create_tables
aws dynamodb list-tables --endpoint-url "$DYNAMODB_ENDPOINT_URL" --no-cli-pager
