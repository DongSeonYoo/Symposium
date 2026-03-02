/**
 * 뉴스 감성 분석 tool.
 * 키워드 기반 간단 스코어링으로 종목 뉴스 감성 분석.
 */

import type { NewsClient } from "../news-client.js";
import type { NewsSentiment, NewsItem } from "@symposium/shared-types";

const POSITIVE_KEYWORDS = [
  "상승", "호실적", "성장", "신고가", "매수", "증가", "흑자", "수주", "계약", "개선",
];

const NEGATIVE_KEYWORDS = [
  "하락", "부진", "적자", "감소", "리콜", "소송", "매도", "저가", "손실", "악화",
];

function scoreArticle(item: NewsItem): number {
  const text = `${item.title} ${item.snippet}`;
  let pos = 0;
  let neg = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) pos++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) neg++;
  }

  return pos - neg;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export async function getSentiment(
  client: NewsClient,
  ticker: string,
  name: string,
  count = 10
): Promise<NewsSentiment> {
  const query = `${name} ${ticker} 주식 뉴스`;
  const items = await client.search(query, Math.min(count, 20));

  const articleCount = items.length;
  let totalScore = 0;

  for (const item of items) {
    totalScore += scoreArticle(item);
  }

  const rawScore = articleCount > 0 ? totalScore / articleCount : 0;
  const score = clamp(rawScore, -1, 1);

  let label: "positive" | "neutral" | "negative";
  if (score > 0.1) {
    label = "positive";
  } else if (score < -0.1) {
    label = "negative";
  } else {
    label = "neutral";
  }

  const summary = `${name}(${ticker}) — 최근 뉴스 감성: ${
    label === "positive" ? "긍정적" : label === "negative" ? "부정적" : "중립"
  } (score: ${score.toFixed(2)}, 기사 ${articleCount}건)`;

  return {
    ticker,
    score: Math.round(score * 100) / 100,
    label,
    articleCount,
    summary,
    items,
  };
}
