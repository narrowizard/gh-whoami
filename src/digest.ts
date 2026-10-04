import type { Counted, Digest, RawBundle, RawRepo } from "./types.js";

/** Topics that carry noise rather than interest signal. */
const TOPIC_STOPWORDS = new Set([
  "awesome", "awesome-list", "list", "examples", "example", "tutorial", "starter",
  "template", "boilerplate", "documentation", "docs", "interview", "hacktoberfest",
  "good-first-issue", "uncategorized", "learning", "course", "book", "books", "blog",
]);

const sortByCount = <T>(rows: [T, number][]): Counted<T>[] =>
  rows
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

function countLanguages(repos: RawRepo[]): Counted[] {
  const m = new Map<string, number>();
  for (const r of repos) if (r.language) m.set(r.language, (m.get(r.language) ?? 0) + 1);
  return sortByCount([...m.entries()]);
}

/** Only upstream repos at/above this star count may appear in the footprint. */
export const FOOTPRINT_MIN_STARS = 1000;

/** Deterministic digest: every number here is computed, never guessed. */
export function buildDigest(bundle: RawBundle, now = new Date()): Digest {
  const { profile, repos, stars, mergedPrs, upstreamStars, forkParents } = bundle;
  const coverage = { ...bundle.coverage };

  const own = repos.filter((r) => !r.fork);
  const forks = repos.filter((r) => r.fork);

  // --- interest fingerprint (stars; topics only, recency-weighted x2 within 2y) ---
  const TWO_Y = 2 * 365 * 24 * 3600 * 1000;
  const topicScore = new Map<string, number>();
  const starLangs = new Map<string, number>();
  const perYear = new Map<number, number>();
  let hot10k = 0, mid1k = 0, niche = 0, total = 0, live = 0;

  for (const s of stars) {
    const age = now.getTime() - new Date(s.starred_at).getTime();
    const weight = age <= TWO_Y ? 2 : 1;
    for (const t of s.repo.topics ?? []) {
      const key = t.toLowerCase();
      if (TOPIC_STOPWORDS.has(key)) continue;
      topicScore.set(key, (topicScore.get(key) ?? 0) + weight);
    }
    if (s.repo.language) starLangs.set(s.repo.language, (starLangs.get(s.repo.language) ?? 0) + 1);

    const year = new Date(s.starred_at).getUTCFullYear();
    perYear.set(year, (perYear.get(year) ?? 0) + 1);

    const st = s.repo.stargazers_count;
    if (st >= 10000) hot10k++;
    else if (st >= 1000) mid1k++;
    if (st < 100) niche++;
    total++;
    if (now.getTime() - new Date(s.repo.pushed_at).getTime() <= 365 * 24 * 3600 * 1000) live++;
  }
  if (total > 0) coverage.starLiveness = `${Math.round((live / total) * 100)}% of starred repos pushed within 1y`;

  // --- contribution evidence, tiered ---
  const byUpstream = new Map<string, number>();
  let ownMerged = 0;
  for (const pr of mergedPrs) {
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    if (repo.split("/")[0] === profile.login) ownMerged++;
    else byUpstream.set(repo, (byUpstream.get(repo) ?? 0) + 1);
  }
  const upstreamEntries = [...byUpstream.entries()].map(([repo, mergedPrs]) => ({
    repo,
    mergedPrs,
    repoStars: upstreamStars[repo] ?? -1,
  }));
  const tier1 = upstreamEntries
    .filter((e) => e.repoStars >= FOOTPRINT_MIN_STARS)
    .sort((a, b) => b.mergedPrs - a.mergedPrs);
  const below = upstreamEntries.filter((e) => e.repoStars < FOOTPRINT_MIN_STARS);
  if (below.length) {
    const prs = below.reduce((s, e) => s + e.mergedPrs, 0);
    coverage.upstreamBelowThreshold = `${prs} merged PRs in ${below.length} upstream repos under ${FOOTPRINT_MIN_STARS} stars (true but excluded from footprint wording)`;
  }

  const ONE_Y = 365 * 24 * 3600 * 1000;
  const tier2OwnActive = own
    .filter((r) => r.stargazers_count > 0 || now.getTime() - new Date(r.pushed_at).getTime() <= ONE_Y)
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
    .slice(0, 6)
    .map((r) => r.name);
  if (ownMerged > 0) coverage.ownMergedPrs = `${ownMerged} merged PRs in own repos (self-merged, weak evidence)`;

  return {
    identity: {
      login: profile.login,
      name: profile.name,
      company: profile.company,
      blog: profile.blog,
      bio: profile.bio,
      since: new Date(profile.created_at).getUTCFullYear(),
      yearsActive: now.getUTCFullYear() - new Date(profile.created_at).getUTCFullYear(),
      followers: profile.followers,
    },
    production: {
      originalRepos: own.length,
      languages: countLanguages(own),
      notable: own
        .filter((r) => r.stargazers_count > 0)
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, 5)
        .map((r) => ({ name: r.name, language: r.language, stars: r.stargazers_count, description: r.description })),
    },
    interestFingerprint: {
      topicsRecentWeighted: sortByCount([...topicScore.entries()]).slice(0, 10),
      starsLangDist: sortByCount([...starLangs.entries()]).slice(0, 8),
      taste: {
        hot10kPlusPct: total ? Math.round((hot10k / total) * 100) : 0,
        mid1kTo10kPct: total ? Math.round((mid1k / total) * 100) : 0,
        nicheUnder100Pct: total ? Math.round((niche / total) * 100) : 0,
      },
      timeline: [...perYear.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, count]) => ({ name: year, count })),
    },
    contributionEvidence: {
      tier1UpstreamMergedPrs: tier1,
      tier1Total: tier1.reduce((s, t) => s + t.mergedPrs, 0),
      tier2OwnActive,
      tier3ForksOnly: forks.slice(0, 12).map((f) => ({ fork: f.name, parent: forkParents[f.name] ?? null })),
    },
    coverage,
    existingReadme: bundle.profileReadme,
  };
}
