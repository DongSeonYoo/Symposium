import type { Action } from "@symposium/shared-types";

export interface ParsedDecision {
  action: Action;
  confidence: number;
  keyArgument: string;
  [key: string]: unknown;
}

/** 마크다운 코드블록 제거 후 JSON 추출 */
function extractJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : raw.trim();
}

/**
 * LLM 텍스트 응답을 파싱.
 * 실패 시 1회 재시도 (동일 로직). 2회 모두 실패 시 HOLD/50 fallback 반환.
 * 주문 경로로 흘러가지 않도록 기본값은 항상 HOLD.
 */
export function parseLlmResponse(
  raw: string,
  fallbackReason = "parse_failed"
): ParsedDecision {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = extractJson(raw);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const action = parsed["action"];
      const confidence = parsed["confidence"];

      if (
        (action === "BUY" || action === "SELL" || action === "HOLD") &&
        typeof confidence === "number" &&
        confidence >= 0 &&
        confidence <= 100
      ) {
        return {
          ...parsed,
          action,
          confidence,
          keyArgument:
            typeof parsed["keyArgument"] === "string"
              ? parsed["keyArgument"]
              : "",
        };
      }
    } catch {
      // 두 번째 시도도 실패하면 fallback
    }
  }

  return {
    action: "HOLD",
    confidence: 50,
    keyArgument: fallbackReason,
    _fallback: true,
  };
}
