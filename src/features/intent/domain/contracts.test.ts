import { describe, expect, it } from "vitest";
import {
  CREDIT_COSTS,
  isClientVisiblePersonStatus,
  isLiteralEvidence,
  isValidScore,
  statusFromIntent,
} from "./contracts";

describe("Intent v1 domain contracts", () => {
  it("keeps the internal radar hidden from the client", () => {
    expect(isClientVisiblePersonStatus("vigiado")).toBe(false);
    expect(isClientVisiblePersonStatus("fora_icp")).toBe(false);
    expect(isClientVisiblePersonStatus("fora_icp", true)).toBe(true);
    expect(isClientVisiblePersonStatus("lead")).toBe(true);
    expect(isClientVisiblePersonStatus("sinal_fraco")).toBe(true);
    expect(isClientVisiblePersonStatus("cliente")).toBe(true);
  });

  it("derives lead status only when a signal exists", () => {
    expect(statusFromIntent(95, false)).toBe("vigiado");
    expect(statusFromIntent(79, true)).toBe("sinal_fraco");
    expect(statusFromIntent(80, true)).toBe("lead");
  });

  it("rejects scores outside the closed range", () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(100)).toBe(true);
    expect(isValidScore(80.5)).toBe(false);
    expect(() => statusFromIntent(101, true)).toThrow(RangeError);
  });

  it("requires cited evidence to be literal", () => {
    const captured = "Estamos avaliando um fornecedor para reduzir custos agora.";
    expect(isLiteralEvidence(captured, "avaliando um fornecedor")).toBe(true);
    expect(isLiteralEvidence(captured, "pretende comprar em breve")).toBe(false);
    expect(isLiteralEvidence(captured, "   ")).toBe(false);
  });

  it("freezes the client credit costs from the product spec", () => {
    expect(CREDIT_COSTS).toEqual({
      onboarding: 12,
      pessoa_julgada: 1,
      email_revelado: 1,
      telefone_revelado: 10,
      verificacao_sem_sinal: 0,
    });
  });
});
