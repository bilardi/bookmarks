.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

BLOCKS = core backend

# Everything on AWS lives in one region, and the Google credentials under one
# path: both can be overridden on the command line.
REGION ?= eu-west-1
GOOGLE_CLIENT ?= /google-client/bookmarks
# The certificate is a stack of its own, and it lives in us-east-1 because
# CloudFront takes a certificate only from there.
CERTIFICATE_REGION ?= us-east-1
# The address of the site, which the certificate is asked for.
SITE_DOMAIN ?= bookmarks.alessandra.bilardi.net
# The address of whoever deploys, the one let in without an invitation: exported in
# the shell or given on the command line, never written in the repository.
CURATOR_EMAIL ?=
# Read from where sam keeps them, so the names are written once.
STACK := $(shell sed -n '/^\[default\.deploy\.parameters\]/,/^\[/s/^stack_name = "\(.*\)"/\1/p' samconfig.toml)
CERTIFICATE_STACK := $(shell sed -n '/^\[certificate\.deploy\.parameters\]/,/^\[/s/^stack_name = "\(.*\)"/\1/p' samconfig.toml)

# One output of the deployed stack, by name.
output = $$(aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
	--query "Stacks[0].Outputs[?OutputKey=='$(1)'].OutputValue" --output text)

# The same, for the certificate stack. Quiet when it fails, because being asked
# before that stack exists is its normal condition.
certificate_output = $$(aws cloudformation describe-stacks --stack-name $(CERTIFICATE_STACK) --region $(CERTIFICATE_REGION) \
	--query "Stacks[0].Outputs[?OutputKey=='$(1)'].OutputValue" --output text 2>/dev/null)

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

.PHONY: local-bundles # build lambdas readable by the local containers
local-bundles: package
	# sam local mounts each bundle into its container without an SELinux label, and
	# where SELinux is enforced a container cannot read a file of the home. The
	# bundles get the label containers may read, and the files a later build writes
	# keep it, since they inherit the label of their folder.
	@if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then \
		chcon -R -t container_file_t backend/dist/lambda; fi

.PHONY: sam-local # build lambdas and run the HTTP API locally (needs make local-up for DynamoDB)
sam-local: local-bundles
	sam local start-api --docker-network bookmarks_default --env-vars local/env.json

.PHONY: test-api # check the HTTP API end to end, starting what is missing
test-api:
	bash local/api-check.sh

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

.PHONY: deploy # deploy the stacks and check them (set AWS_PROFILE and CURATOR_EMAIL)
deploy: check-profile package
	# The prices come first: if the Pricing API does not give one, nothing is
	# deployed, and the stack keeps the prices it had. Then the same two passes as
	# in aws-card-clash: the address of the site is known only after the first.
	@test -n "$(CURATOR_EMAIL)" || { echo "set CURATOR_EMAIL, the address of whoever deploys"; exit 1; }
	@prices=$$(cd backend && npx -y tsx scripts/s3-prices.ts $(REGION)) \
		|| { echo "the S3 prices could not be read: nothing was deployed"; exit 1; }; \
		id=$$(aws ssm get-parameter --name $(GOOGLE_CLIENT)/id \
		--query Parameter.Value --output text --region $(REGION)) \
		&& secret=$$(aws ssm get-parameter --name $(GOOGLE_CLIENT)/secret \
		--with-decryption --query Parameter.Value --output text --region $(REGION)) \
		&& test -n "$$id" && test -n "$$secret" \
		|| { echo "the Google credentials are missing, see docs/SETUP.md"; exit 1; }; \
		cert=$(call certificate_output,CertificateArn); \
		test "$(DOMAIN)" != "off" || cert=""; \
		if test -n "$$cert"; then \
			name=$(call certificate_output,SiteDomainName); \
			domain="WithDomain=true SiteCertificateArn=$$cert SiteDomainName=$$name"; \
			echo "deploying with the domain: $$name"; \
		else \
			domain="WithDomain=false"; \
			echo "deploying without a domain: the site stays on CloudFront"; fi; \
		common="GoogleClientId=$$id GoogleClientSecret=$$secret CuratorEmail=$(CURATOR_EMAIL) $$prices $$domain"; \
		sam deploy --no-fail-on-empty-changeset --parameter-overrides $$common \
		&& sam deploy --no-fail-on-empty-changeset --parameter-overrides $$common \
			SiteCallbackUrl=$(call output,SiteUrl) DistributionUrl=$(call output,DistributionUrl)
	@name=$(call certificate_output,SiteDomainName); test -z "$$name" || test "$(DOMAIN)" = "off" \
		|| echo "the DNS of $$name has to be a CNAME to $(call output,DistributionDomain)"
	$(MAKE) check-deployed

.PHONY: check-deployed # check the deployed system, writing nothing (set AWS_PROFILE)
check-deployed: check-profile
	STACK=$(STACK) REGION=$(REGION) bash scripts/deployed-check.sh

.PHONY: outputs # print the outputs of the deployed stack (set AWS_PROFILE)
outputs: check-profile
	aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
		--query "Stacks[0].Outputs" --output table

.PHONY: deploy-certificate # ask ACM for the certificate of the site (set AWS_PROFILE)
deploy-certificate: check-profile
	# The stack waits until the certificate is validated, and nothing validates it
	# until the record printed by make certificate-record is in the DNS: run that in
	# another shell while this one waits, then make deploy.
	sam deploy --config-env certificate --no-fail-on-empty-changeset --parameter-overrides SiteDomainName=$(SITE_DOMAIN)

.PHONY: certificate-record # print the DNS record that validates the certificate (set AWS_PROFILE)
certificate-record: check-profile
	@arn=$$(aws acm list-certificates --region $(CERTIFICATE_REGION) --certificate-statuses PENDING_VALIDATION ISSUED \
		--query "CertificateSummaryList[?DomainName=='$(SITE_DOMAIN)'].CertificateArn | [0]" --output text) \
		&& aws acm describe-certificate --certificate-arn $$arn --region $(CERTIFICATE_REGION) \
		--query "Certificate.DomainValidationOptions[0].ResourceRecord" --output table

.PHONY: destroy-certificate # delete the certificate, keeping the site up on CloudFront (set AWS_PROFILE)
destroy-certificate: check-profile
	# ACM refuses to delete a certificate a distribution still presents: the site
	# lets go of it first, back on the CloudFront address.
	$(MAKE) deploy DOMAIN=off
	sam delete --config-env certificate

.PHONY: destroy # delete the stack, the files of every user with it (set AWS_PROFILE)
destroy: check-profile
	# The content bucket holds the files of every user, and once deleted they are
	# gone for good: nothing is emptied until the name of the stack is typed.
	@printf "This deletes the site and the files of every user, and the files cannot be recovered.\nType the name of the stack ($(STACK)) to go on: "; \
		read answer; test "$$answer" = "$(STACK)" || { echo "nothing was deleted"; exit 1; }
	@bucket=$(call output,BucketName); test -n "$$bucket" && aws s3 rm s3://$$bucket --recursive || echo "no site bucket to empty"
	@bucket=$(call output,ContentBucketName); test -n "$$bucket" && aws s3 rm s3://$$bucket --recursive || echo "no content bucket to empty"
	sam delete
