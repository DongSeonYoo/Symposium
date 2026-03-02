import { describe, it, expect } from "vitest";
import { parseLlmResponse } from "../utils/parse-llm.js";

describe("parseLlmResponse", () => {
  it("정상 JSON 파싱 성공", () => {
    const raw = JSON.stringify({ action: "BUY", confidence: 80, keyArgument: "저평가" });
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("BUY");
    expect(result.confidence).toBe(80);
    expect(result.keyArgument).toBe("저평가");
  });

  it("마크다운 코드블록 감싸인 경우 추출", () => {
    const raw = "```json\n{\"action\":\"SELL\",\"confidence\":65,\"keyArgument\":\"고평가\"}\n```";
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("SELL");
    expect(result.confidence).toBe(65);
  });

  it("코드블록 언어 표시 없어도 추출", () => {
    const raw = "```\n{\"action\":\"HOLD\",\"confidence\":50,\"keyArgument\":\"불확실\"}\n```";
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("HOLD");
  });

  it("완전히 깨진 JSON → HOLD/50 fallback", () => {
    const raw = "이것은 JSON이 아닙니다. 그냥 텍스트입니다.";
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("HOLD");
    expect(result.confidence).toBe(50);
    expect(result._fallback).toBe(true);
  });

  it("action 필드 누락 → fallback", () => {
    const raw = JSON.stringify({ confidence: 80, keyArgument: "뭔가" });
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("HOLD");
    expect(result._fallback).toBe(true);
  });

  it("confidence 범위 초과(0~100 외) → fallback", () => {
    const raw = JSON.stringify({ action: "BUY", confidence: 150, keyArgument: "과신" });
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("HOLD");
    expect(result._fallback).toBe(true);
  });

  it("action이 허용값 외('MAYBE') → fallback", () => {
    const raw = JSON.stringify({ action: "MAYBE", confidence: 70, keyArgument: "모름" });
    const result = parseLlmResponse(raw);
    expect(result.action).toBe("HOLD");
    expect(result._fallback).toBe(true);
  });

  it("부가 필드는 그대로 전달", () => {
    const raw = JSON.stringify({
      action: "BUY",
      confidence: 75,
      keyArgument: "성장",
      stopLoss: 65000,
    });
    const result = parseLlmResponse(raw);
    expect(result.stopLoss).toBe(65000);
  });
});
