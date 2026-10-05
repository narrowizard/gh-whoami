# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — type-check without emitting
- Run the CLI: `node dist/cli.js <username> [--out output] [--max-stars 2000] [--no-llm]`
  - `--no-llm` produces only the digest JSON (useful for testing the data pipeline)
- No test suite yet — verify changes by running the CLI against a real username.

Credentials come from env vars, `./.env`, or a file passed via `--dotenv <path>` (see `.env.example`): `GITHUB_TOKEN` (optional; raises GitHub rate limits) and one of three LLM configuration styles — `ANTHROPIC_*`, `OPENAI_*`, or generic `LLM_*` (highest priority; resolution order in `src/llm.ts`). Never print token values.

## Architecture

`src/cli.ts` orchestrates a four-step pipeline: **collect → digest → LLM generate → report**.

**The core design principle: digest layering == claim permissions.** `src/digest.ts` compresses raw API data into tiered facts; `src/prompt.ts` maps those tiers to the wording the LLM is allowed to use. When you change what a tier contains, you are changing the model's allowed claims:

- **T1** — upstream merged PRs in repos ≥ `FOOTPRINT_MIN_STARS` (1000, constant in `digest.ts`). The only evidence that permits "contributor (n merged PRs)". Below-threshold upstream PRs are demoted to a `coverage` note (recorded, but excluded from footprint wording).
- **T2** — own active repos. Capability statements only, no "contribution" wording.
- **T3** — forks. "Participates in / follows" only, never contributor.

Invariants to preserve when modifying the code:

- `digest.ts` is pure (no network IO, takes `now` for determinism). All fetching lives in `collect.ts` and is sequential by design — GitHub rate limits are tight unauthenticated.
- The `coverage` map declares empty/capped data sources, and the prompt forbids speculation on those dimensions. When adding a new source, wire its absence into `coverage` rather than leaving it implicit.
- `llm.ts` uses plain `fetch` against Anthropic- or OpenAI-compatible endpoints (no SDK). Thinking-style models can consume the budget before emitting text — `max_tokens` is 8192 and empty responses raise an error carrying `stop_reason`.
- The tool never pushes to GitHub; `report.ts` prints the evidence summary as the human review gate before manual publishing.
- Generated READMEs are always English (no language flag). `README.md` and `README_cn.md` are parallel translations — keep both in sync when behavior or docs change.
- TypeScript ESM with `NodeNext` resolution: relative imports require `.js` extensions.
