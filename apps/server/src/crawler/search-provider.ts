/**
 * Search Provider Abstraction
 * Supports Brave Search, Serper, SerpAPI, and Tavily with automatic fallback.
 */

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  position: number;
  date?: string;
}

export interface SearchOptions {
  page?: number;
  num?: number;
  country?: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ─── Brave Search Provider ──────────────────────────────────────

export class BraveSearchProvider implements SearchProvider {
  readonly name = "Brave Search";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    const count = opts?.num ? Math.min(20, Math.max(1, opts.num)) : 10;
    const offset = opts?.page && opts.page > 1 ? (opts.page - 1) * count : 0;
    const country = opts?.country ?? "IN";

    const params = new URLSearchParams({
      q: query,
      count: String(count),
      offset: String(offset),
      country,
    });

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": this.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Brave search HTTP ${response.status}: ${errText.slice(0, 120)}`);
    }

    const data = (await response.json()) as {
      web?: {
        results?: Array<{
          url: string;
          title: string;
          description: string;
          page_age?: string;
        }>;
      };
    };

    return (data.web?.results ?? []).map((item, i) => ({
      url: item.url,
      title: item.title ?? "",
      snippet: item.description ?? "",
      domain: extractDomain(item.url),
      position: offset + i + 1,
      date: item.page_age,
    }));
  }
}

// ─── Serper Provider ────────────────────────────────────────────

export class SerperSearchProvider implements SearchProvider {
  readonly name = "Serper";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    const page = opts?.page ?? 1;
    const num = opts?.num ?? 10;
    const gl = (opts?.country ?? "in").toLowerCase();

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num, page, gl, hl: "en", tbs: "qdr:m" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errBody?.message ? `Serper: ${errBody.message}` : `Serper HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      organic?: Array<{
        link: string;
        title: string;
        snippet: string;
        position: number;
        date?: string;
      }>;
    };

    return (data.organic ?? []).map((item) => ({
      url: item.link,
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      domain: extractDomain(item.link),
      position: item.position,
      date: item.date,
    }));
  }
}

// ─── SerpAPI Provider ───────────────────────────────────────────

export class SerpAPISearchProvider implements SearchProvider {
  readonly name = "SerpAPI";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    const num = opts?.num ?? 10;
    const start = opts?.page && opts.page > 1 ? (opts.page - 1) * num : 0;
    const gl = (opts?.country ?? "in").toLowerCase();

    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      engine: "google",
      gl,
      hl: "en",
      num: String(num),
      start: String(start),
    });

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);

    const data = (await response.json()) as {
      organic_results?: Array<{
        link: string;
        title: string;
        snippet: string;
        position: number;
        date?: string;
      }>;
    };

    return (data.organic_results ?? []).map((item) => ({
      url: item.link,
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      domain: extractDomain(item.link),
      position: item.position,
      date: item.date,
    }));
  }
}

// ─── Tavily Search Provider ─────────────────────────────────────

export class TavilySearchProvider implements SearchProvider {
  readonly name = "Tavily";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    const maxResults = opts?.num ?? 10;

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Tavily HTTP ${response.status}: ${errText.slice(0, 100)}`);
    }

    const data = (await response.json()) as {
      results?: Array<{
        url: string;
        title: string;
        content: string;
        score: number;
        published_date?: string;
      }>;
    };

    return (data.results ?? []).map((item, i) => ({
      url: item.url,
      title: item.title ?? "",
      snippet: item.content ?? "",
      domain: extractDomain(item.url),
      position: i + 1,
      date: item.published_date,
    }));
  }
}

// ─── Chained Provider with Auto-Fallback ─────────────────────────

export class ChainedSearchProvider implements SearchProvider {
  readonly name = "Chained Multi-Provider";
  private providers: SearchProvider[];

  constructor(providers: SearchProvider[]) {
    this.providers = providers;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (this.providers.length === 0) return [];
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, opts);
        if (results.length > 0 || this.providers.length === 1) {
          return results;
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        errors.push(`${provider.name}: ${msg}`);
        console.warn(`[SearchProvider] ${provider.name} failed for "${query}":`, msg);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }
    return [];
  }
}

// ─── Key Detection & Factory ────────────────────────────────────

export const SEARCH_KEYS = [
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
  "SERPER_API_KEY",
  "SERPAPI_KEY",
  "TAVILY_API_KEY",
] as const;

export function hasSearchApiKey(): boolean {
  return SEARCH_KEYS.some((k) => !!process.env[k]?.trim());
}

export function createSearchProvider(): SearchProvider {
  const explicit = (process.env["SEARCH_PROVIDER"] ?? "").toLowerCase().trim();

  const braveKey = process.env["BRAVE_SEARCH_API_KEY"]?.trim() || process.env["BRAVE_API_KEY"]?.trim();
  const serperKey = process.env["SERPER_API_KEY"]?.trim();
  const serpapiKey = process.env["SERPAPI_KEY"]?.trim();
  const tavilyKey = process.env["TAVILY_API_KEY"]?.trim();

  // If explicit single provider is chosen
  if (explicit === "brave" && braveKey) return new BraveSearchProvider(braveKey);
  if (explicit === "serper" && serperKey) return new SerperSearchProvider(serperKey);
  if (explicit === "serpapi" && serpapiKey) return new SerpAPISearchProvider(serpapiKey);
  if (explicit === "tavily" && tavilyKey) return new TavilySearchProvider(tavilyKey);

  // Otherwise build a chain of all available providers in preferred priority order
  const active: SearchProvider[] = [];
  if (braveKey) active.push(new BraveSearchProvider(braveKey));
  if (serperKey) active.push(new SerperSearchProvider(serperKey));
  if (tavilyKey) active.push(new TavilySearchProvider(tavilyKey));
  if (serpapiKey) active.push(new SerpAPISearchProvider(serpapiKey));

  if (active.length === 1) {
    return active[0]!;
  }
  if (active.length > 1) {
    return new ChainedSearchProvider(active);
  }

  // Fallback default
  return new SerperSearchProvider(serperKey ?? "");
}
