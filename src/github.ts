const API = "https://api.github.com";

/** Minimal sequential GitHub REST client (keeps concurrency at 1). */
export class GitHub {
  constructor(private token: string | undefined) {}

  private headers(accept: string): Record<string, string> {
    const h: Record<string, string> = {
      Accept: accept,
      "User-Agent": "gh-whoami",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async request<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers: this.headers(accept) });
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
    const res = await fetch(`${API}${path}`, { headers: this.headers(accept) });
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
