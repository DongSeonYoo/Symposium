/**
 * 뉴스 검색 tool.
 * Serper API를 통해 뉴스 기사를 검색하고 dedupe 처리.
 */

import type { NewsClient } from "../news-client.js";
import type { NewsItem } from "@symposium/shared-types";

export async function searchNews(
  client: NewsClient,
  query: string,
  count = 10
): Promise<NewsItem[]> {
  const limit = Math.min(count, 20);
  return client.search(query, limit);
}
