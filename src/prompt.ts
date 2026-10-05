import type { Digest } from "./types.js";

/** Marker appended to speculative statements (rule 2). */
const INFERRED_MARK = "🔮";

/** System rules are the anti-hallucination contract:
 *  digest layers map to claim permissions. */
export function buildSystem(): string {
  return [
    "You write GitHub profile READMEs from a structured digest (JSON). Strict rules:",
    "1. Contribution claims only from contributionEvidence.tier1UpstreamMergedPrs (already filtered to repos with >=1000 stars; repoStars is verifiable): mergedPrs>=1 grants \"contributor (n merged PRs)\"; tier3ForksOnly entries are forks — never call them contributor/author/maintainer, only \"participates in / follows\".",
    `2. At most 2 speculative statements, each ending with the ${INFERRED_MARK} icon; never speculate on dimensions marked empty in coverage.`,
    "3. Languages/topics/stacks may only come from digest entries.",
    "4. Treat existingReadme as background reference — its tone, links, and badges inform the rewrite; reuse what still fits naturally, drop or fix what doesn't. You are not bound to reproduce it.",
    "5. Keep identity.bio as a signature quote in a visible spot if present.",
    "6. Structure: one-line positioning → currently working on → tech fingerprint → open-source footprint → links & badges. Max ~180 words.",
    "7. Output markdown body only: no code fences, no commentary.",
  ].join("\n");
}

export function buildUser(digest: Digest): string {
  return `Write in English. Tone: restrained, technical, no hype.\n\ndigest:\n${JSON.stringify(digest, null, 2)}\n\nGenerate the profile README now.`;
}
