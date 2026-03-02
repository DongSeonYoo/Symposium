import Anthropic from "@anthropic-ai/sdk";
import type { PersonaId } from "@symposium/shared-types";
import { synthesizeVotes, type PersonaRoundResult } from "./debate.js";

export interface SynthesisResult {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  debateSummary: string;
  personaVotes: Array<{
    persona: PersonaId;
    action: string;
    confidence: number;
    keyArgument: string;
    weight: number;
  }>;
}

/**
 * 최종 합산 단계.
 * - 액션/confidence 결정권: 기존 가중합산 규칙(synthesizeVotes) 유지
 * - Opus 역할: debateSummary(토론 요약 + 투자 설명) 생성에만 집중
 */
export async function synthesize(
  client: Anthropic,
  params: {
    ticker: string;
    name: string;
    round3: PersonaRoundResult[];
    weights: Record<PersonaId, number>;
  }
): Promise<SynthesisResult> {
  const { ticker, name, round3, weights } = params;

  // 1. 가중합산으로 최종 액션/confidence 확정 (LLM 개입 없음)
  const { action, confidence, weightedScores } = synthesizeVotes({
    round3,
    weights,
    ticker,
    name,
  });

  // 2. 페르소나 투표 정리
  const personaVotes = round3.map((r) => ({
    persona: r.persona,
    action: r.result.action,
    confidence: r.result.confidence,
    keyArgument: r.result.keyArgument,
    weight: weights[r.persona] ?? 0.2,
  }));

  // 3. Opus에게 debateSummary 생성 요청 (액션 결정 역할 아님)
  const votesSummary = round3
    .map(
      (r) =>
        `[${r.persona}] ${r.result.action}(${r.result.confidence}점, 가중치 ${((weights[r.persona] ?? 0.2) * 100).toFixed(0)}%) — ${r.result.keyArgument}`
    )
    .join("\n");

  let debateSummary: string;
  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system:
        "당신은 투자 위원회 의장입니다. 5인 페르소나의 토론 결과를 바탕으로 최종 투자 검토 보고서를 작성하십시오. 한국어로 작성하며, 300자 이내로 핵심만 요약하십시오.",
      messages: [
        {
          role: "user",
          content: `종목: ${ticker} (${name})
최종 판단: ${action} (합산 확신도 ${confidence}점)

페르소나별 최종 투표:
${votesSummary}

위 토론 결과를 바탕으로 투자 검토 보고서를 작성하십시오.`,
        },
      ],
    });

    debateSummary =
      msg.content[0]?.type === "text"
        ? msg.content[0].text
        : `${action} 판단 (확신도 ${confidence})`;
  } catch (err) {
    // Opus 호출 실패 시 fallback — 주문 경로에 영향 없음
    console.error(`[synthesize] Opus call failed, using fallback summary: ${err}`);
    debateSummary = `${name}(${ticker}) — ${action} 판단 (확신도 ${confidence}점). 5인 페르소나 가중합산 결과.`;
  }

  return { action, confidence, debateSummary, personaVotes };
}
