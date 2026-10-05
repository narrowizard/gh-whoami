import { GitHub, sleep } from "./github.js";
import type { RawBundle, RawEvent, RawRepo, RawSearchItem, RawStar } from "./types.js";

/** Collect all public sources for one user into a RawBundle. Sequential on purpose. */
export async function collect(
  gh: GitHub,
  user: string,
  maxStars: number,
  log: (msg: string) => void = () => {},
): Promise<RawBundle> {
  const coverage: Record<string, string> = {};

  const profile = await gh.request<import("./types.js").RawProfile>(`/users/${user}`);
  log(`profile: @${profile.login}`);

  const repos = await gh.paginate<RawRepo>(`/users/${user}/repos?sort=pushed`, { maxPages: 5 });
  if (repos.length >= 500) coverage.repos = "capped at 500 (most recent by push)";
  log(`repos: ${repos.length}${coverage.repos ? " (capped)" : ""}`);

  const starPages = Math.max(1, Math.ceil(maxStars / 100));
  const stars = await gh.paginate<RawStar>(`/users/${user}/starred`, {
    accept: "application/vnd.github.star+json",
    maxPages: starPages,
  });
  if (stars.length >= maxStars) coverage.stars = `capped at ${maxStars}`;
  if (stars.length === 0) coverage.stars = "no public stars";
  log(`stars: ${stars.length}${coverage.stars ? " (capped)" : ""}`);

  let events: RawEvent[] = [];
  try {
    events = await gh.paginate<RawEvent>(`/users/${user}/events/public`, { maxPages: 2 });
  } catch {
    /* events are optional */
  }
  if (events.length === 0) {
    coverage.events = "empty — no public GitHub activity in ~90d (work may be private or on other platforms)";
  }
  log(`events: ${events.length}`);

  // Upstream evidence: merged PRs anywhere. Search API is tight (10/min unauthenticated).
  const mergedPrs: RawSearchItem[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await gh.request<{ items: RawSearchItem[] }>(
      `/search/issues?q=author:${user}+type:pr+is:merged&per_page=100&page=${page}`,
    );
    mergedPrs.push(...data.items);
    const lastPage = data.items.length < 100 || page === 10;
    log(`merged PRs: ${mergedPrs.length}${lastPage ? "" : ` (search page ${page}, fetching more…)`}`);
    if (data.items.length < 100) break;
    await sleep(1500);
  }
  if (mergedPrs.length >= 1000) coverage.mergedPrs = "capped at 1000 by search API";

  // Star counts for upstream repos the user contributed to (footprint threshold filter).
  const prsByRepo = new Map<string, number>();
  for (const pr of mergedPrs) {
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    prsByRepo.set(repo, (prsByRepo.get(repo) ?? 0) + 1);
  }
  const upstreamStars: Record<string, number> = {};
  const upstreamToCheck = [...prsByRepo.entries()]
    .filter(([repo]) => repo.split("/")[0] !== profile.login)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  for (const [repo] of upstreamToCheck) {
    try {
      const r = await gh.request<{ stargazers_count: number }>(`/repos/${repo}`);
      upstreamStars[repo] = r.stargazers_count;
    } catch {
      /* uncounted → digest treats it as below threshold */
    }
  }
  log(`upstream star checks: ${Object.keys(upstreamStars).length}/${upstreamToCheck.length} repos`);

  // Existing profile README — its badges/links must survive regeneration.
  let profileReadme: string | null = null;
  try {
    profileReadme = await gh.requestText(`/repos/${user}/${user}/readme`, "application/vnd.github.raw");
  } catch {
    /* no profile README repo */
  }
  log(`existing profile README: ${profileReadme ? "found" : "none"}`);

  // Fork parents (upstream identification) for the 10 most recently pushed forks.
  const forkParents: Record<string, string | null> = {};
  const forks = repos.filter((r) => r.fork).slice(0, 10);
  for (const f of forks) {
    try {
      const full = await gh.request<{ parent?: { full_name: string } }>(`/repos/${user}/${f.name}`);
      forkParents[f.name] = full.parent?.full_name ?? null;
    } catch {
      forkParents[f.name] = null;
    }
  }
  log(`fork parents: ${Object.keys(forkParents).length} resolved`);

  if (gh.rate) {
    const mins = Math.max(0, Math.round((gh.rate.resetEpoch * 1000 - Date.now()) / 60000));
    log(`GitHub rate limit: ${gh.rate.remaining}/${gh.rate.limit} left (resets in ~${mins} min)`);
  }

  return { profile, repos, stars, events, mergedPrs, profileReadme, upstreamStars, forkParents, coverage };
}
