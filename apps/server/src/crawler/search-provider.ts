/**
 * Search Provider Abstraction
 * Supports Serper, SerpAPI, Brave Search API
 */

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  position: number;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

// ─── Serper Provider ────────────────────────────────────────────

export class SerperSearchProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return [];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 10, gl: "in" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        organic?: Array<{
          link: string;
          title: string;
          snippet: string;
          position: number;
        }>;
      };

      return (data.organic ?? []).map(item => ({
        url: item.link,
        title: item.title ?? "",
        snippet: item.snippet ?? "",
        domain: extractDomain(item.link),
        position: item.position,
      }));
    } catch {
      return [];
    }
  }
}

// ─── SerpAPI Provider ───────────────────────────────────────────

export class SerpAPISearchProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      engine: "google",
      gl: "in",
      hl: "en",
      num: "10",
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);
    if (!response.ok) throw new Error(`SerpAPI failed: ${response.status}`);

    const data = await response.json() as {
      organic_results?: Array<{
        link: string;
        title: string;
        snippet: string;
        position: number;
      }>;
    };

    return (data.organic_results ?? []).map(item => ({
      url: item.link,
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      domain: extractDomain(item.link),
      position: item.position,
    }));
  }
}

// ─── Brave Search Provider ──────────────────────────────────────

export class BraveSearchProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query, count: "10", country: "IN" });
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": this.apiKey },
    });

    if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);

    const data = await response.json() as {
      web?: { results?: Array<{ url: string; title: string; description: string }> };
    };

    return (data.web?.results ?? []).map((item, i) => ({
      url: item.url,
      title: item.title ?? "",
      snippet: item.description ?? "",
      domain: extractDomain(item.url),
      position: i + 1,
    }));
  }
}

// ─── Factory ────────────────────────────────────────────────────

export function createSearchProvider(): SearchProvider {
  const provider = process.env["SEARCH_PROVIDER"] ?? "serper";

  switch (provider) {
    case "serper":
      return new SerperSearchProvider(process.env["SERPER_API_KEY"] ?? "");
    case "serpapi":
      return new SerpAPISearchProvider(process.env["SERPAPI_KEY"] ?? "");
    case "brave":
      return new BraveSearchProvider(process.env["BRAVE_SEARCH_API_KEY"] ?? "");
    default:
      throw new Error(`Unknown search provider: ${provider}`);
  }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
