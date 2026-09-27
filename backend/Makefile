.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

.PHONY: install # install runtime + dev deps
install:
	npm install

.PHONY: test # run unit tests (needs DynamoDB Local: make local-up at repo root)
test:
	npm run test

.PHONY: typecheck # run TypeScript type checking
typecheck:
	npm run typecheck

.PHONY: build # backend has no emit here; build is a typecheck gate
build:
	npm run typecheck

.PHONY: package # bundle the Lambda functions into dist/lambda
package:
	npx -y tsx scripts/build-lambdas.ts

.PHONY: lint # type check acts as lint gate
lint:
	npm run typecheck

.PHONY: format # placeholder, formatting handled at repo level
format:
	@echo "no formatter configured for backend"
