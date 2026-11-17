.DEFAULT_GOAL := help

.PHONY: help
help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

.PHONY: install
install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

.PHONY: check
check: ## Type-check the library, the hooks and the tests
	pnpm run type-check

.PHONY: lint
lint: ## Lint
	pnpm run lint:check

.PHONY: fmt
fmt: ## Format in place
	pnpm run format:write

.PHONY: fmt-check
fmt-check: ## Fail if anything is unformatted
	pnpm run format:check

.PHONY: test
test: ## Run the unit tests
	pnpm run test

.PHONY: records
records: ## Validate the decision records
	urzua check

.PHONY: hooks-install
hooks-install: ## Wire the git hooks that run the record check
	urzua hooks install

.PHONY: ci
ci: fmt-check lint check test records ## Everything CI runs
