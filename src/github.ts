const API = "https://api.github.com";

/** Minimal sequential GitHub REST client (keeps concurrency at 1). */
export class GitHub {
  /** Latest rate-limit snapshot seen in response headers, if any. */
  rate: { limit: number; remaining: number; resetEpoch: number } | null = null;

  constructor(
    private token: string | undefined,
    private debug: (msg: string) => void = () => {},
  ) {}

  private headers(accept: string): Record<string, string> {
    const h: Record<string, string> = {
      Accept: accept,
      "User-Agent": "gh-whoami",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Single fetch funnel: tracks rate limit, emits debug logs. */
  private async fetch(path: string, accept: string): Promise<Response> {
    const res = await fetch(`${API}${path}`, { headers: this.headers(accept) });
    const limit = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (limit !== null && remaining !== null) {
      this.rate = {
        limit: Number(limit),
        remaining: Number(remaining),
        resetEpoch: Number(res.headers.get("x-ratelimit-reset") ?? 0),
      };
    }
    this.debug(
      `GET ${path} → ${res.status}` + (this.rate ? ` (rate ${this.rate.remaining}/${this.rate.limit})` : ""),
    );
    return res;
  }

  async request<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
    const res = await this.fetch(path, accept);
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        throw new Error(
          "GitHub API rate limit exceeded. Set GITHUB_TOKEN (raises the quota to 5000 req/h) or retry later.",
        );
      }
      throw new Error(`GitHub API ${res.status} on ${path}`);
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async requestText(path: string, accept: string): Promise<string> {
    const res = await this.fetch(path, accept);
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    return await res.text();
  }

  /** Page through a list endpoint until exhausted or maxPages reached. */
  async paginate<T>(
    path: string,
    opts: { perPage?: number; maxPages?: number; accept?: string } = {},
  ): Promise<T[]> {
    const perPage = opts.perPage ?? 100;
    const maxPages = opts.maxPages ?? 10;
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const items = await this.request<T[]>(
        `${path}${sep}per_page=${perPage}&page=${page}`,
        opts.accept,
      );
      out.push(...items);
      if (items.length < perPage) break;
    }
    return out;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
