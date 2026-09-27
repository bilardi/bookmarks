// Point the AWS SDK at DynamoDB Local with fake credentials.
process.env.AWS_REGION ??= "eu-west-1";
process.env.AWS_ACCESS_KEY_ID ??= "fake";
process.env.AWS_SECRET_ACCESS_KEY ??= "fake";
process.env.DYNAMODB_ENDPOINT_URL ??= "http://127.0.0.1:8000";
process.env.TABLE_NAME ??= "bookmarks";
