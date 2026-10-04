/** Raw GitHub API shapes — only the fields we consume. */

export interface RawProfile {
  login: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface RawRepo {
  name: string;
  full_name: string;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  description: string | null;
  archived: boolean;
  topics?: string[];
}

export interface RawStar {
  starred_at: string;
  repo: RawRepo;
}

export interface RawEvent {
  type: string;
  created_at: string;
  repo?: { name: string };
}

export interface RawSearchItem {
  title: string | null;
  html_url: string;
  repository_url: string;
  pull_request?: Record<string, unknown>;
}

export interface RawBundle {
  profile: RawProfile;
  repos: RawRepo[];
  stars: RawStar[];
  events: RawEvent[];
  mergedPrs: RawSearchItem[];
  profileReadme: string | null;
  /** upstream repo full_name -> stargazers_count, for the footprint threshold */
  upstreamStars: Record<string, number>;
  /** fork repo name -> upstream parent full_name (best effort) */
  forkParents: Record<string, string | null>;
  coverage: Record<string, string>;
}

/** Deterministic digest — the single artifact handed to the LLM.
 *  Layering == claim permissions: tier1 grants "contributor",
 *  tier3 (forks) never does, coverage gaps forbid speculation. */

export interface Counted<T = string> {
  name: T;
  count: number;
}

export interface Digest {
  identity: {
    login: string;
    name: string | null;
    company: string | null;
    blog: string | null;
    bio: string | null;
    since: number;
    yearsActive: number;
    followers: number;
  };
  production: {
    originalRepos: number;
    languages: Counted[];
    notable: { name: string; language: string | null; stars: number; description: string | null }[];
  };
  interestFingerprint: {
    topicsRecentWeighted: Counted[];
    starsLangDist: Counted[];
    taste: { hot10kPlusPct: number; mid1kTo10kPct: number; nicheUnder100Pct: number };
    timeline: Counted<number>[]; // stars per year, ascending
  };
  contributionEvidence: {
    /** upstream repos at or above the footprint star threshold */
    tier1UpstreamMergedPrs: { repo: string; mergedPrs: number; repoStars: number }[];
    tier1Total: number;
    tier2OwnActive: string[];
    tier3ForksOnly: { fork: string; parent: string | null }[];
  };
  coverage: Record<string, string>;
  existingReadme: string | null;
}
