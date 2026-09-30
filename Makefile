.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

BLOCKS = core backend frontend

# Everything on AWS lives in one region, and the Google credentials under one
# path: both can be overridden on the command line.
REGION ?= eu-west-1
GOOGLE_CLIENT ?= /google-client/bookmarks
# The certificate is a stack of its own, and it lives in us-east-1 because
# CloudFront takes a certificate only from there.
CERTIFICATE_REGION ?= us-east-1
# The address of the site, which the certificate is asked for.
SITE_DOMAIN ?= bookmarks.bilardi.net
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
	# Every function keeps its container after the first call: without this, each call
	# starts a new one, and a page that makes six calls waits for six starts. LAZY and
	# not EAGER: with nested stacks, EAGER starts a container per function that the
	# first call does not reuse, and at the exit those are left running. A bundle built
	# again by make local-bundles replaces only its own container, so a change to the
	# backend needs no restart.
	sam local start-api --docker-network bookmarks_default --env-vars local/env.json --warm-containers LAZY

.PHONY: test-api # check the HTTP API end to end, starting what is missing
test-api:
	bash local/api-check.sh

.PHONY: dev # run the frontend dev server on 5173, with /api proxied to make sam-local
dev:
	$(MAKE) -C frontend dev

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

.PHONY: local-clean # remove the local containers, the Lambda ones sam local may leave behind included
local-clean: local-down
	# sam local names its containers at random, and its labels carry the name of the
	# function in the template but nothing of the project: they are found by image,
	# which takes those of any project running sam local on this machine at the time.
	docker ps -aq --filter ancestor=public.ecr.aws/lambda/nodejs:22-rapid-x86_64 | xargs -r docker rm -f

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
	$(MAKE) deploy-site
	$(MAKE) check-deployed

.PHONY: deploy-site # rebuild and upload the site alone, without CloudFormation (set AWS_PROFILE)
deploy-site: check-profile
	# The build is static, so the identity of the pool is baked into it: a new pool
	# means a new build, which is why this reads the outputs every time.
	@issuer=$(call output,Issuer) \
		&& client=$(call output,UserPoolClientId) \
		&& bucket=$(call output,BucketName) \
		&& dist=$(call output,DistributionId) \
		&& test -n "$$issuer" && test -n "$$client" && test -n "$$bucket" && test -n "$$dist" \
		|| { echo "the stack has no site outputs: deploy it first"; exit 1; }; \
		VITE_AUTH=cognito VITE_COGNITO_ISSUER=$$issuer VITE_COGNITO_CLIENT_ID=$$client $(MAKE) -C frontend build \
		&& aws s3 sync frontend/dist s3://$$bucket --delete \
		&& aws cloudfront create-invalidation --distribution-id $$dist --paths '/*' \
			--query Invalidation.Status --output text

.PHONY: check-deployed # check the deployed system, writing nothing (set AWS_PROFILE)
check-deployed: check-profile
	STACK=$(STACK) REGION=$(REGION) bash scripts/deployed-check.sh

.PHONY: outputs # print the outputs of the deployed stack (set AWS_PROFILE)
outputs: check-profile
	aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
		--query "Stacks[0].Outputs" --output table

# The table and the pool of the stack, for the commands of the curator.
curator = cd backend && TABLE_NAME=$(call output,TableName) AWS_REGION=$(REGION) npx -y tsx scripts/curator.ts
pool = $$(basename $(call output,Issuer))

.PHONY: invite # let an address in, EMAIL=<address> (set AWS_PROFILE)
invite: check-profile
	@test -n "$(EMAIL)" || { echo "set EMAIL, the address to invite"; exit 1; }
	@$(curator) invite $(EMAIL)

.PHONY: ban # take the invitation back, sign the person out and remove them from the pool, EMAIL=<address> (set AWS_PROFILE)
ban: check-profile
	# The invitation is read only at the first sign-in: the user of the pool goes
	# too, and with it every refresh token it holds, so the next sign-in is refused.
	# The token already in hand lasts until it expires, fifteen minutes at most. The
	# bookmarks and the files of the person stay.
	@test -n "$(EMAIL)" || { echo "set EMAIL, the address to ban"; exit 1; }
	# Banning the curator would delete their user, and the next sign-in would make a
	# new one, with a new sub: every bookmark of the curator would be left without an
	# owner. The address is the one the stack was deployed with, not the shell's.
	@curator=$$(aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
		--query "Stacks[0].Parameters[?ParameterKey=='CuratorEmail'].ParameterValue" --output text); \
		if test "$$(echo "$(EMAIL)" | tr '[:upper:]' '[:lower:]')" = "$$(echo "$$curator" | tr '[:upper:]' '[:lower:]')"; then \
		echo "$(EMAIL) is the curator, who cannot be banned: nothing was changed"; exit 1; fi
	@$(curator) ban $(EMAIL)
	@user=$$(aws cognito-idp list-users --user-pool-id $(pool) --region $(REGION) \
		--filter "email = \"$(EMAIL)\"" --query "Users[0].Username" --output text); \
		if test -z "$$user" || test "$$user" = "None"; then echo "no user in the pool for $(EMAIL)"; else \
		aws cognito-idp admin-user-global-sign-out --user-pool-id $(pool) --region $(REGION) --username $$user \
		&& aws cognito-idp admin-delete-user --user-pool-id $(pool) --region $(REGION) --username $$user \
		&& echo "signed out and removed from the pool: $$user"; fi

.PHONY: usage # the usage and the costs of everybody, month by month (set AWS_PROFILE)
usage: check-profile
	@$(curator) usage $(REGION)

.PHONY: import # load bookmarks from a CSV file as the curator, CSV=<file> (set AWS_PROFILE and CURATOR_EMAIL)
import: check-profile
	# The curator is found in the pool by the address: without a first sign-in there
	# is nobody to write as, and nothing is written.
	@test -n "$(CSV)" || { echo "set CSV, the file to import, see docs/IMPORT.md"; exit 1; }
	@test -n "$(CURATOR_EMAIL)" || { echo "set CURATOR_EMAIL, the address of whoever deploys"; exit 1; }
	@sub=$$(aws cognito-idp list-users --user-pool-id $(pool) --region $(REGION) \
		--filter "email = \"$(CURATOR_EMAIL)\"" --query "Users[0].Attributes[?Name=='sub'].Value | [0]" --output text); \
		if test -z "$$sub" || test "$$sub" = "None"; then echo "$(CURATOR_EMAIL) never signed in: sign in once, then import"; exit 1; fi; \
		csv=$$(realpath "$(CSV)"); \
		cd backend && TABLE_NAME=$(call output,TableName) CONTENT_BUCKET=$(call output,ContentBucketName) \
		AWS_REGION=$(REGION) CURATOR_SUB=$$sub CURATOR_EMAIL=$(CURATOR_EMAIL) npx -y tsx scripts/import.ts "$$csv"

.PHONY: export # everything of a person in a zip, and a link to it for seven days, EMAIL=<address> (set AWS_PROFILE)
export: check-profile
	# The folder is a temporary one, removed once the archive is uploaded: the data
	# of the person does not stay on this computer. The link lasts seven days only
	# with permanent keys: signed with temporary ones, it ends with their session.
	@test -n "$(EMAIL)" || { echo "set EMAIL, the address of the person"; exit 1; }
	@bucket=$(call output,ContentBucketName); dir=$$(mktemp -d); \
		sub=$$(cd backend && TABLE_NAME=$(call output,TableName) CONTENT_BUCKET=$$bucket AWS_REGION=$(REGION) \
			npx -y tsx scripts/export.ts $(EMAIL) $$dir | tail -1) \
		&& test -n "$$sub" \
		&& (cd $$dir && zip -qr $$dir.zip .) \
		&& aws s3 cp $$dir.zip s3://$$bucket/exports/$$sub.zip --region $(REGION) --only-show-errors \
		&& echo "the link, valid seven days:" \
		&& aws s3 presign s3://$$bucket/exports/$$sub.zip --expires-in 604800 --region $(REGION); \
		status=$$?; rm -rf $$dir $$dir.zip; exit $$status

.PHONY: purge # delete everything of a banned person, asking whether their shared items pass to the curator, EMAIL=<address> (set AWS_PROFILE)
purge: check-profile
	# After make ban and make export: a person still in the pool could sign in again
	# and start with nothing, so they are banned first. The curator cannot be purged.
	# The shared items are listed before the question, which answers no by default,
	# and nothing is deleted until the address is typed again.
	@test -n "$(EMAIL)" || { echo "set EMAIL, the address of the person"; exit 1; }
	@curator=$$(aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
		--query "Stacks[0].Parameters[?ParameterKey=='CuratorEmail'].ParameterValue" --output text); \
		if test "$$(echo "$(EMAIL)" | tr '[:upper:]' '[:lower:]')" = "$$(echo "$$curator" | tr '[:upper:]' '[:lower:]')"; then \
		echo "$(EMAIL) is the curator, who cannot be purged: nothing was changed"; exit 1; fi
	@user=$$(aws cognito-idp list-users --user-pool-id $(pool) --region $(REGION) \
		--filter "email = \"$(EMAIL)\"" --query "Users[0].Username" --output text); \
		if test -n "$$user" && test "$$user" != "None"; then echo "$(EMAIL) is still in the pool: make ban first"; exit 1; fi
	@bucket=$(call output,ContentBucketName); table=$(call output,TableName); \
		preview=$$(cd backend && TABLE_NAME=$$table AWS_REGION=$(REGION) npx -y tsx scripts/purge.ts preview $(EMAIL)) || exit 1; \
		shared=$$(echo "$$preview" | head -1); keep=""; sub=""; summary=""; \
		if test "$$shared" -gt 0; then \
		echo "$$(echo "$$preview" | tail -n +2)"; \
		printf "Pass these $$shared shared items to the curator, under from/? [y/N] "; read pass; \
		case "$$pass" in \
		y|Y) test -n "$(CURATOR_EMAIL)" || { echo "set CURATOR_EMAIL, to pass the shared items to the curator"; exit 1; }; \
			sub=$$(aws cognito-idp list-users --user-pool-id $(pool) --region $(REGION) \
				--filter "email = \"$(CURATOR_EMAIL)\"" --query "Users[0].Attributes[?Name=='sub'].Value | [0]" --output text); \
			if test -z "$$sub" || test "$$sub" = "None"; then echo "$(CURATOR_EMAIL) never signed in: nobody to pass the shared items to"; exit 1; fi; \
			keep=keep-shared; summary=", passing its $$shared shared items to the curator first";; \
		*) summary=", its $$shared shared items included";; \
		esac; fi; \
		printf "This deletes everything of $(EMAIL)$$summary, and it cannot be undone.\nType the address again to go on: "; \
		read answer; test "$$answer" = "$(EMAIL)" || { echo "nothing was deleted"; exit 1; }; \
		gone=$$(cd backend && TABLE_NAME=$$table CONTENT_BUCKET=$$bucket AWS_REGION=$(REGION) \
			CURATOR_SUB=$$sub CURATOR_EMAIL=$(CURATOR_EMAIL) npx -y tsx scripts/purge.ts run $(EMAIL) $$keep | tee /dev/stderr | tail -1) \
		&& test -n "$$gone" \
		&& aws s3 rm s3://$$bucket/exports/$$gone.zip --region $(REGION) --only-show-errors

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
