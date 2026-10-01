# The function URL

The public page reads through a function URL that only the distribution may call: CloudFront signs every request with origin access control, and a call that does not come from the distribution is refused with a 403 before the function starts. Lambda charges for invocations, so a refused call that never becomes an invocation costs nothing.

`make check-deployed` proves the refusal. The test below proves the cost: twenty direct calls, then the invocations of the function in the same minutes.

## The test

The commands only read, apart from the twenty calls. While the test runs, the public page is not opened from the site: a request missing the cache of CloudFront is an invocation, and it would count.

```sh
export AWS_PROFILE=<profile>
STACK="${STACK:-bookmarks}"
REGION="${REGION:-eu-west-1}"
LOG=tmp/logs/function-url-denied.log
mkdir -p tmp/logs

# the function URL from the stack, and the function behind it
URL="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='PublicFunctionUrl'].OutputValue" --output text)"
FN="$(aws lambda list-functions --region "$REGION" \
    --query "Functions[?contains(FunctionName, 'PublicFunction')].FunctionName" --output text)"
echo "$URL $FN" | tee "$LOG"

# twenty direct calls: each one answers 403
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "start $START" | tee -a "$LOG"
for i in $(seq 20); do curl -s -o /dev/null -w "%{http_code}\n" "${URL}public/items"; done \
    | sort | uniq -c | tee -a "$LOG"
```

CloudWatch publishes the metrics of Lambda within minutes. After at least five, in the same shell:

```sh
# the invocations of the public function since the first call: none expected
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "end $END" | tee -a "$LOG"
aws cloudwatch get-metric-statistics --region "$REGION" --namespace AWS/Lambda \
    --metric-name Invocations --dimensions Name=FunctionName,Value="$FN" \
    --start-time "$START" --end-time "$END" \
    --period 60 --statistics Sum --output text | tee -a "$LOG"
```

The expected result:

- **the calls**: `20 403`
- **the invocations**: no datapoint, or a `Sum` of 0

## The result

Run on 2026-10-01, from the log without its first line, the address and the name of the function:

```text
start 2026-10-01T15:53:55Z
     20 403
end 2026-10-01T16:04:17Z
Invocations
```

Twenty calls refused, and in the ten minutes around them the metric has no datapoint: the function never started, so the refused calls were never charged.
