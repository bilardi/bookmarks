.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

BLOCKS = core backend

# Everything on AWS lives in one region: it can be overridden on the command line.
REGION ?= eu-west-1

.PHONY: install test lint format typecheck build # run the target in every block
install test lint format typecheck build:
	@for b in $(BLOCKS); do $(MAKE) -C $$b $@ || exit $$?; done

.PHONY: major minor patch # bump version, regenerate CHANGELOG, create commit and tag
major:
	$(MAKE) release PART=major
minor:
	$(MAKE) release PART=minor
patch:
	$(MAKE) release PART=patch

release:
	npm version $(PART)

.PHONY: package # build deployable artifacts (Lambda bundles)
package:
	cd backend && $(MAKE) package

.PHONY: prices # print the S3 prices read from the AWS Pricing API (set AWS_PROFILE)
prices: check-profile
	cd backend && npx -y tsx scripts/s3-prices.ts $(REGION)

.PHONY: validate # lint the SAM templates, the nested ones too (the root only names them)
validate:
	sam validate --lint --region $(REGION)
	for t in sam/*.yaml; do sam validate --lint --region $(REGION) --template $$t || exit 1; done

.PHONY: local-up # start DynamoDB Local and create tables
local-up:
	docker compose -f local/docker-compose.yml up -d

.PHONY: local-down # stop local containers
local-down:
	docker compose -f local/docker-compose.yml down

# Guard for every command that writes on AWS: without the profile they would all
# fall back to the default account, which is rarely the one meant.
check-profile:
	@test -n "$$AWS_PROFILE" || { echo "export AWS_PROFILE first, see docs/SETUP.md"; exit 1; }
	@account=$$(aws sts get-caller-identity --query Account --output text) \
		&& echo "using account $$account"
