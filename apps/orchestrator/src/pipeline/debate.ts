import Anthropic from "@anthropic-ai/sdk";
import type { PersonaId } from "@symposium/shared-types";
import { parseLlmResponse, type ParsedDecision } from "../utils/parse-llm.js";

const PERSONAS: PersonaId[] = ["buffett", "soros", "dalio", "lynch", "parkhyunju"];

const PERSONA_PROMPTS: Record<PersonaId, string> = {
  buffett:
    "당신은 워런 버핏입니다. 가치투자 원칙에 따라 판단하십시오. 내재가치 대비 현재 주가가 충분히 할인되어 있는지, 기업의 경쟁 해자가 견고한지를 핵심 기준으로 삼으십시오.",
  soros:
    "당신은 조지 소로스입니다. 반사성 이론을 바탕으로 시장 불균형을 찾으십시오. 달러 인덱스, 원달러 환율, 외국인 수급 동향을 반드시 고려하십시오.",
  dalio:
    "당신은 레이 달리오입니다. 올웨더 원칙에 따라 리스크를 먼저 평가하십시오. VIX, 채권금리, 인플레이션 사이클을 분석하십시오.",
  lynch:
    "당신은 피터 린치입니다. 실적 성장과 업종 모멘텀을 중심으로 판단하십시오. PEG 비율이 1 이하인 성장주를 찾으십시오.",
  parkhyunju:
    "당신은 박현주입니다. 한국 주식시장의 구조적 특성을 바탕으로 판단하십시오. 외국인/기관 수급 동향, 정부 정책 방향을 핵심 기준으로 삼으십시오.",
};

const OUTPUT_SCHEMA = `JSON 형식으로만 응답하십시오 (마크다운 금지):
{"action":"BUY"|"SELL"|"HOLD","confidence":0-100,"keyArgument":"핵심 논거 1줄"}`;

export interface PersonaRoundResult {
  persona: PersonaId;
  result: ParsedDecision;
}

export interface DebateContext {
  ticker: string;
  name: string;
  marketData: Record<string, unknown>;
  macroContext: Record<string, unknown>;
  weights: Record<PersonaId, number>;
}

/** Round 1: 5 페르소나 독립 판단 (병렬) */
export async function runRound1(
  client: Anthropic,
  ctx: DebateContext
): Promise<PersonaRoundResult[]> {
  const prompt = `
종목: ${ctx.ticker} (${ctx.name})
시장 데이터: ${JSON.stringify(ctx.marketData)}
거시경제: ${JSON.stringify(ctx.macroContext)}

위 데이터를 바탕으로 매매 판단을 내리십시오.
${OUTPUT_SCHEMA}`;

  const results = await Promise.all(
    PERSONAS.map(async (persona) => {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: PERSONA_PROMPTS[persona],
        messages: [{ role: "user", content: prompt }],
      });
      const raw =
        msg.content[0]?.type === "text" ? msg.content[0].text : "";
      return { persona, result: parseLlmResponse(raw, `${persona}_r1_fail`) };
    })
  );

  return results;
}

/** Round 2: 타 페르소나 판단 공개 후 교차 비판 (병렬) */
export async function runRound2(
  client: Anthropic,
  ctx: DebateContext,
  round1: PersonaRoundResult[]
): Promise<PersonaRoundResult[]> {
  const othersSummary = round1
    .map((r) => `${r.persona}: ${r.result.action}(${r.result.confidence}) — ${r.result.keyArgument}`)
    .join("\n");

  const results = await Promise.all(
    round1.map(async ({ persona, result: myR1 }) => {
      const prompt = `
당신의 Round 1 판단: ${myR1.action}(${myR1.confidence}) — ${myR1.keyArgument}

다른 페르소나들의 판단:
${othersSummary}

가장 취약한 논거를 비판한 뒤, 자신의 최종 판단을 다시 제시하십시오.
${OUTPUT_SCHEMA}`;

      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: PERSONA_PROMPTS[persona],
        messages: [{ role: "user", content: prompt }],
      });
      const raw =
        msg.content[0]?.type === "text" ? msg.content[0].text : "";
      return { persona, result: parseLlmResponse(raw, `${persona}_r2_fail`) };
    })
  );

  return results;
}

/** Round 3: 자신에 대한 비판을 보고 재반론 (병렬) */
export async function runRound3(
  client: Anthropic,
  ctx: DebateContext,
  round2: PersonaRoundResult[]
): Promise<PersonaRoundResult[]> {
  const criticisms = Object.fromEntries(
    round2.map((r) => [r.persona, r.result.keyArgument])
  );

  const results = await Promise.all(
    round2.map(async ({ persona, result: myR2 }) => {
      const prompt = `
당신의 Round 2 판단: ${myR2.action}(${myR2.confidence}) — ${myR2.keyArgument}

다른 페르소나들이 당신에 대해 제기한 비판:
${Object.entries(criticisms)
  .filter(([p]) => p !== persona)
  .map(([p, c]) => `${p}: ${c}`)
  .join("\n")}

비판에 재반론하거나 설득됐다면 입장을 수정하십시오.
${OUTPUT_SCHEMA}`;

      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: PERSONA_PROMPTS[persona],
        messages: [{ role: "user", content: prompt }],
      });
      const raw =
        msg.content[0]?.type === "text" ? msg.content[0].text : "";
      return { persona, result: parseLlmResponse(raw, `${persona}_r3_fail`) };
    })
  );

  return results;
}

export interface SynthesisInput {
  round3: PersonaRoundResult[];
  weights: Record<PersonaId, number>;
  ticker: string;
  name: string;
}

/** 가중 합산: confidence × weight → 최종 action 결정 */
export function synthesizeVotes(input: SynthesisInput): {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  weightedScores: Record<string, number>;
} {
  const scores: Record<"BUY" | "SELL" | "HOLD", number> = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  const weightedScores: Record<string, number> = {};
  let totalWeight = 0;

  for (const { persona, result } of input.round3) {
    const w = input.weights[persona] ?? 0.2;
    const score = result.confidence * w;
    scores[result.action as "BUY" | "SELL" | "HOLD"] += score;
    weightedScores[persona] = score;
    totalWeight += w;
  }

  // 정규화
  const action = (Object.entries(scores) as ["BUY" | "SELL" | "HOLD", number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const confidence = totalWeight > 0
    ? Math.round(scores[action] / totalWeight)
    : 50;

  return { action, confidence, weightedScores };
}
