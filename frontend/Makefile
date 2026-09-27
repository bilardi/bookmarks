.PHONY: help # print this help list
help:
	grep PHONY Makefile | sed 's/.PHONY: /make /' | grep -v grep

.PHONY: install # install runtime + dev deps
install:
	npm install

.PHONY: dev # run the dev server on 5173, with /api proxied to the local API
dev:
	npm run dev

.PHONY: test # run unit tests
test:
	npm run test

.PHONY: typecheck # run TypeScript type checking
typecheck:
	npm run typecheck

.PHONY: build # build static assets into dist/
build:
	npm run build

.PHONY: lint # type check acts as lint gate
lint:
	npm run typecheck

.PHONY: format # placeholder, formatting handled at repo level
format:
	@echo "no formatter configured for frontend"
