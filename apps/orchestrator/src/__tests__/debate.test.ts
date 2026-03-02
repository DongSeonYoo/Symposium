import { describe, it, expect, vi } from "vitest";
import { runRound1, runRound2, runRound3, synthesizeVotes } from "../pipeline/debate.js";
import type { DebateContext, PersonaRoundResult } from "../pipeline/debate.js";
import type { PersonaId } from "@symposium/shared-types";

const PERSONAS: PersonaId[] = ["buffett", "soros", "dalio", "lynch", "parkhyunju"];

const ctx: DebateContext = {
  ticker: "005930",
  name: "삼성전자",
  marketData: { currentPrice: 70000, per: 15 },
  macroContext: { vix: 18, usdKrw: 1330 },
  weights: { buffett: 0.2, soros: 0.2, dalio: 0.2, lynch: 0.2, parkhyunju: 0.2 },
};

function makeAnthropicMock(responseJson: object) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify(responseJson) }],
      }),
    },
  };
}

describe("runRound1", () => {
  it("5 페르소나 병렬 호출 → 5개 결과 반환", async () => {
    const client = makeAnthropicMock({ action: "BUY", confidence: 75, keyArgument: "저평가" });
    const results = await runRound1(client as any, ctx);
    expect(results).toHaveLength(5);
    expect(client.messages.create).toHaveBeenCalledTimes(5);
  });

  it("각 결과에 persona 필드 포함", async () => {
    const client = makeAnthropicMock({ action: "HOLD", confidence: 50, keyArgument: "불확실" });
    const results = await runRound1(client as any, ctx);
    const personas = results.map((r) => r.persona);
    expect(personas).toEqual(expect.arrayContaining(PERSONAS));
  });

  it("LLM이 깨진 JSON 반환 → fallback HOLD/50으로 처리, 나머지 정상 진행", async () => {
    let callCount = 0;
    const client = {
      messages: {
        create: vi.fn().mockImplementation(async () => {
          callCount++;
          // buffett(첫 번째 호출)만 파싱 불가 텍스트 반환
          const text = callCount === 1 ? "죄송합니다, 판단하기 어렵습니다." : JSON.stringify({ action: "BUY", confidence: 80, keyArgument: "성장" });
          return { content: [{ type: "text", text }] };
        }),
      },
    };
    const results = await runRound1(client as any, ctx);
    expect(results).toHaveLength(5);
    const fallback = results.find((r) => r.result._fallback === true);
    expect(fallback).toBeDefined();
    const normal = results.filter((r) => !r.result._fallback);
    expect(normal.length).toBe(4);
  });
});

describe("runRound2", () => {
  it("Round 1 결과를 컨텍스트로 주입해 5회 호출", async () => {
    const client = makeAnthropicMock({ action: "BUY", confidence: 80, keyArgument: "재확인" });
    const round1: PersonaRoundResult[] = PERSONAS.map((p) => ({
      persona: p,
      result: { action: "BUY", confidence: 75, keyArgument: "저평가" },
    }));
    const results = await runRound2(client as any, ctx, round1);
    expect(results).toHaveLength(5);
    expect(client.messages.create).toHaveBeenCalledTimes(5);
    // 호출 시 다른 페르소나 요약이 포함됐는지 확인
    const firstCall = client.messages.create.mock.calls[0][0];
    expect(firstCall.messages[0].content).toContain("soros");
  });
});

describe("runRound3", () => {
  it("Round 2 결과(비판)를 주입해 5회 호출", async () => {
    const client = makeAnthropicMock({ action: "BUY", confidence: 85, keyArgument: "최종확신" });
    const round2: PersonaRoundResult[] = PERSONAS.map((p) => ({
      persona: p,
      result: { action: "BUY", confidence: 80, keyArgument: "재확인" },
    }));
    const results = await runRound3(client as any, ctx, round2);
    expect(results).toHaveLength(5);
  });
});

describe("synthesizeVotes", () => {
  it("전원 BUY → action=BUY", () => {
    const round3: PersonaRoundResult[] = PERSONAS.map((p) => ({
      persona: p,
      result: { action: "BUY", confidence: 80, keyArgument: "" },
    }));
    const { action } = synthesizeVotes({ round3, weights: ctx.weights, ticker: "005930", name: "삼성전자" });
    expect(action).toBe("BUY");
  });

  it("전원 HOLD → action=HOLD", () => {
    const round3: PersonaRoundResult[] = PERSONAS.map((p) => ({
      persona: p,
      result: { action: "HOLD", confidence: 50, keyArgument: "" },
    }));
    const { action } = synthesizeVotes({ round3, weights: ctx.weights, ticker: "005930", name: "삼성전자" });
    expect(action).toBe("HOLD");
  });

  it("3 BUY vs 2 SELL → action=BUY (confidence weighted)", () => {
    const round3: PersonaRoundResult[] = [
      { persona: "buffett", result: { action: "BUY", confidence: 90, keyArgument: "" } },
      { persona: "soros", result: { action: "BUY", confidence: 85, keyArgument: "" } },
      { persona: "dalio", result: { action: "BUY", confidence: 70, keyArgument: "" } },
      { persona: "lynch", result: { action: "SELL", confidence: 60, keyArgument: "" } },
      { persona: "parkhyunju", result: { action: "SELL", confidence: 55, keyArgument: "" } },
    ];
    const { action } = synthesizeVotes({ round3, weights: ctx.weights, ticker: "005930", name: "삼성전자" });
    expect(action).toBe("BUY");
  });

  it("confidence 0~100 범위 내 정수 반환", () => {
    const round3: PersonaRoundResult[] = PERSONAS.map((p) => ({
      persona: p,
      result: { action: "BUY", confidence: 75, keyArgument: "" },
    }));
    const { confidence } = synthesizeVotes({ round3, weights: ctx.weights, ticker: "005930", name: "삼성전자" });
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
    expect(Number.isInteger(confidence)).toBe(true);
  });
});
