# gh-whoami

English | [简体中文](README_cn.md)

Generate an evidence-grounded GitHub profile README from public data — profile, repos, stars, and merged PRs — with an LLM.

The core design: **the digest's layering defines the LLM's claim permissions.** Raw API data is compressed into a deterministic, tiered digest before the LLM ever sees it, so the model can only state what the evidence allows — never invent contributions.

```
GitHub API ──► collect ──► digest (deterministic stats) ──► LLM (single-shot, rule-bound) ──► README draft
               sequential     tiered evidence + coverage       anti-hallucination rules       review, then publish
```

## How it works

1. **Collect** — six public sources, no OAuth scopes needed: user profile, repos, starred repos (with timestamps), merged PRs via search, public events (optional, often empty), and the existing profile README.
2. **Digest** — everything is reduced to computed facts: language distributions, topic fingerprint (recency-weighted), star timeline, taste profile, and contribution evidence split into tiers with explicit coverage notes for whatever came back empty.
3. **Generate** — a single LLM call turns the digest into a README, bound by rules that map tiers to wording.
4. **Review** — the tool prints an evidence summary and never pushes. You read the diff and publish yourself.

## Evidence tiers

| Tier | Data | Allowed wording |
|---|---|---|
| **T1** | Merged PRs in upstream repos (verified via search API; only repos ≥1k★, the rest are demoted to a coverage note) | `contributor (n merged PRs)` |
| **T2** | Active original repos | capability statements, no "contribution" wording |
| **T3** | Forks | "participates in / follows" only — never contributor |

Additional generation rules (see `src/prompt.ts`): at most 2 speculative statements, each marked `(inferred)`; languages and topics may only come from digest entries; dimensions marked empty in `coverage` are off-limits for speculation; the existing README serves as tone/content reference, not a template to copy.

## Usage

Requires Node.js ≥ 20.

```bash
npx gh-whoami <username> [--out output] [--max-stars 2000] [--no-llm]
```

`GITHUB_TOKEN` is optional (60 req/h unauthenticated, 5000 with a token) but recommended — the footprint filter needs a handful of extra repo lookups. LLM credentials resolve from environment variables or a `.env` file (see Configuration below).

### From source

```bash
git clone https://github.com/narrowizard/gh-whoami && cd gh-whoami
npm install && npm run build
node dist/cli.js <username>
```

## Configuration

The LLM endpoint is resolved from environment variables (or a `.env` file — copy `.env.example`; real env vars take precedence). Three styles are supported, with `LLM_*` taking priority:

```bash
# Anthropic-compatible (including local gateways)
ANTHROPIC_BASE_URL=…
ANTHROPIC_AUTH_TOKEN=…   # or ANTHROPIC_API_KEY
ANTHROPIC_MODEL=…

# OpenAI-compatible (DeepSeek, GLM, OpenRouter, …)
OPENAI_BASE_URL=…
OPENAI_API_KEY=…
OPENAI_MODEL=…

# Generic, explicit
LLM_PROVIDER=openai|anthropic
LLM_BASE_URL=…
LLM_API_KEY=…
LLM_MODEL=…
```

Use `--no-llm` to produce only the digest JSON without any LLM call.

## Output

- `<user>-digest.json` — the full tiered digest: inspectable, reusable, cacheable
- `<user>-README.md` — the generated draft, ending with a deterministic gh-whoami attribution footer

## Limitations

- Stars are collecting, not using — a weak signal by design; we only mine repo `topics` (no marketing prose from descriptions)
- Public events are frequently empty (private repos, other platforms); the digest declares this in `coverage` instead of guessing
- Unauthenticated search allows 10 requests/min — fine for one user (1–2 calls)
- Thinking-style models can burn the token budget before writing text; the error reports `stop_reason` if you need to raise `max_tokens`
