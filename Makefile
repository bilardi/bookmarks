.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

BLOCKS = core backend

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

.PHONY: local-up # start DynamoDB Local and create tables
local-up:
	docker compose -f local/docker-compose.yml up -d

.PHONY: local-down # stop local containers
local-down:
	docker compose -f local/docker-compose.yml down
