/**
 * Serper API (Google Search) 뉴스 클라이언트.
 * NEWS_API_KEY 환경변수 필요 (Serper API key).
 */

import type { NewsItem } from "@symposium/shared-types";

const BASE_URL = "https://google.serper.dev";
const TIMEOUT_MS = 5_000;

export interface SerperNewsResult {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
  date?: string;
}

export class NewsClient {
  private apiKey: string;

  constructor() {
    const key = process.env.NEWS_API_KEY;
    if (!key) {
      throw new Error("NEWS_API_KEY not set");
    }
    this.apiKey = key;
  }

  async search(query: string, count = 10): Promise<NewsItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}/news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify({ q: query, num: Math.min(count, 20) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Serper API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as { news?: SerperNewsResult[] };
      const newsItems = data.news ?? [];

      // dedupe by url
      const seen = new Set<string>();
      const results: NewsItem[] = [];

      for (const item of newsItems) {
        const url = item.link ?? "";
        if (!url || seen.has(url)) continue;
        seen.add(url);

        results.push({
          title: item.title ?? "",
          source: item.source ?? "",
          publishedAt: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
          url,
          snippet: item.snippet ?? "",
        });
      }

      return results;
    } finally {
      clearTimeout(timer);
    }
  }
}
