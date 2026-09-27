.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

.PHONY: install # install runtime + dev deps
install:
	npm install

.PHONY: test # run unit tests
test:
	npm run test

.PHONY: typecheck # run TypeScript type checking
typecheck:
	npm run typecheck

.PHONY: build # core has no emit; build is a typecheck gate
build:
	npm run typecheck

.PHONY: lint # type check acts as lint gate for core
lint:
	npm run typecheck

.PHONY: format # placeholder, formatting handled at repo level
format:
	@echo "no formatter configured for core"
