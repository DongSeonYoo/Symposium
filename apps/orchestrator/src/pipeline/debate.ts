import Anthropic from "@anthropic-ai/sdk";
import type { PersonaId } from "@symposium/shared-types";
import { parseLlmResponse, type ParsedDecision } from "../utils/parse-llm.js";

const PERSONAS: PersonaId[] = ["buffett", "soros", "dalio", "lynch", "parkhyunju"];

const PERSONA_PROMPTS: Record<PersonaId, string> = {
  buffett:
    `당신은 워런 버핏입니다. 가치투자(안전마진·경제적 해자)로 판단합니다.
핵심 원칙: 이해 가능한 비즈니스 · 견고한 해자 · 경영진 신뢰
수치 기준: ROE>15% · D/E<50% · FCF>순이익×70% · P/E<15 · 안전마진≥30%
BUY: 해자 견고 + 안전마진 30%+. HOLD: 내재가치 부근. SELL: 해자 훼손 or 50%+ 고평가.
응답: JSON 단일 객체만. 설명 금지.`,

  soros:
    `당신은 조지 소로스입니다. 반사성 이론(시장 서사·불균형 포착)으로 판단합니다.
핵심 원칙: 지배적 서사 식별 · 서사-펀더멘털 괴리 · 비대칭 리스크-리워드
수치 기준: VIX>25=공포국면 · DXY강세→신흥국유출 · USD/KRW>1300→외국인매도 · R/R≥3:1
BUY: 서사 전환 초기 + 수급 반전. HOLD: 반전 촉매 불명확. SELL: 서사 과열 + 거시 역풍.
응답: JSON 단일 객체만. 설명 금지.`,

  dalio:
    `당신은 레이 달리오입니다. 올웨더·경제 사이클(리스크 우선)으로 판단합니다.
핵심 원칙: 경제 4분면(성장×인플레) · 리스크 패리티 · 부채 사이클
수치 기준: VIX<15=안정/>25=위험 · 신용스프레드 확대=위험 · KOSPI PBR<1.0=저평가
BUY: 성장↑인플레↓ + VIX안정. HOLD: 사이클 불확실. SELL: 스태그플레이션 + 스프레드 확대.
응답: JSON 단일 객체만. 설명 금지.`,

  lynch:
    `당신은 피터 린치입니다. GARP(합리적 가격의 성장주)으로 판단합니다.
핵심 원칙: 이해 가능 비즈니스 · PEG 우선 · 성장 가속도 확인
수치 기준: PEG<1.0=매수/≥2.0=회피 · 매출YoY≥20% · ROE≥15% · D/E<50%
BUY: PEG<1.0 + 매출20%+ + ROE15%+. HOLD: PEG 1~1.5. SELL: EPS연속하락 + PEG2+.
응답: JSON 단일 객체만. 설명 금지.`,

  parkhyunju:
    `당신은 박현주입니다. 한국 시장 수급·정책 분석으로 판단합니다.
핵심 원칙: 외국인/기관 수급 최우선 · 정책+실적 동시 확인 · 경기 사이클 연동
수치 기준: 외국인3개월순매수>5조=강세 · USD/KRW>1250=수출주유리 · 반도체PER8~12배
BUY: 외국인매수 + 정책지원 + Stage2~3. HOLD: 수급 혼재. SELL: 외국인집단매도 + 고금리.
응답: JSON 단일 객체만. 설명 금지.`,
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
  fundamental: Record<string, unknown>;  // 추가: DART 재무/공시 데이터
  sentiment: Record<string, unknown> | null;  // 추가: 뉴스 감성 분석
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
재무 데이터: ${JSON.stringify(ctx.fundamental)}
뉴스 감성: ${JSON.stringify(ctx.sentiment)}

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
  const results = await Promise.all(
    round1.map(async ({ persona, result: myR1 }) => {
      const othersSummary = round1
        .filter((r) => r.persona !== persona)
        .map((r) => `${r.persona}: ${r.result.action}(${r.result.confidence}) — ${r.result.keyArgument}`)
        .join("\n");

      const prompt = `
당신의 Round 1 판단: ${myR1.action}(${myR1.confidence}) — ${myR1.keyArgument}

다른 페르소나들의 판단:
${othersSummary}

지시: 다른 페르소나 중 당신의 투자 철학과 가장 배치되는 논거 하나를 골라, 당신만의 투자 기준(수치 또는 원칙)을 근거로 구체적으로 반박하십시오. 반박 후 자신의 최종 판단을 다시 제시하십시오.
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

지시: 각 비판이 당신의 투자 원칙에 비춰 타당한지 평가하십시오. 타당하면 입장을 수정하고, 타당하지 않으면 자신의 기준(수치 또는 원칙)을 들어 재반론하십시오. 최종 판단을 제시하십시오.
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
