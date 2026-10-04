import type { Digest } from "./types.js";

/** Console review summary — the human gate before any push. */
export function printSummary(digest: Digest, files: string[]): void {
  const { identity, contributionEvidence: ev, coverage } = digest;
  console.log(`\n=== digest summary: ${identity.login} ===`);
  console.log(`Identity: ${identity.name ?? identity.login} · since ${identity.since} (${identity.yearsActive}y)`);

  console.log(`\n[T1 upstream ≥1k★ · may say contributor] ${ev.tier1Total} merged PRs`);
  for (const t of ev.tier1UpstreamMergedPrs.slice(0, 5)) console.log(`   - ${t.repo} (${t.repoStars}★): ${t.mergedPrs}`);

  console.log(`[T2 own active repos] ${ev.tier2OwnActive.join(" · ") || "none"}`);
  console.log(`[T3 forks · participation signal only] ${ev.tier3ForksOnly.map((f) => f.fork).join(" · ") || "none"}`);

  const warnKeys = Object.entries(coverage).filter(([k]) => k !== "starLiveness");
  if (warnKeys.length) {
    console.log(`\n[coverage notes]`);
    for (const [k, v] of warnKeys) console.log(`   - ${k}: ${v}`);
  }

  console.log(`\nOutput files:`);
  for (const f of files) console.log(`   - ${f}`);
  console.log(`\nReview, then publish manually (this tool never pushes).`);
}
