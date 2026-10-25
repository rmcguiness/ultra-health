# Contributing to Ultra Health

Thanks for your interest. Ultra Health is an early-stage project maintained by one person,
so small, focused pull requests are the easiest to review.

## Ground rules

- **Never commit real health data.** No Health exports, back-test output, snapshots or
  screenshots of real values. Use demo mode (`apps/mobile/src/demo/`) or synthetic fixtures.
  The `data/` directory is git-ignored for this reason.
- **Never commit secrets.** CI runs gitleaks on every push and pull request.
- Report security problems privately; see [SECURITY.md](SECURITY.md).
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Rules that are easy to break

[CLAUDE.md](CLAUDE.md) is the full list. The short version:

- Never log health values (use `src/logger.ts`).
- Never blend sources: a series comes from one source kind.
- Gaps are not zeros.
- Migrations are append-only.
- The sync engine is the only database writer.
- `src/db`, `src/sync`, `src/health/types.ts` and `packages/core` must not import
  React Native.
- Analytic claims need a citation in [docs/algorithms.md](docs/algorithms.md).

## Setup

Requirements: Node 22.12+ (`nvm use`) and pnpm 10. Xcode is only needed for iOS builds.

```bash
pnpm install
pnpm check            # prettier, typecheck, lint and tests, the same as CI
cd apps/mobile && pnpm web   # the app in a browser, on generated demo data
```

## Pull requests

1. Open an issue first for anything larger than a bug fix, so we can agree on the approach.
2. Branch from `main` and keep the change focused.
3. Add or update tests. Pure logic goes in `packages/core` with unit tests; storage and sync
   changes get tests against in-memory SQLite in `apps/mobile`.
4. Run `pnpm check`. If the UI changed, add a before/after screenshot taken in demo mode.
5. Fill in the pull request template.

## Commit style

Short imperative subject lines ("Add waist circumference trend"), with detail in the body
when it helps a reviewer.
