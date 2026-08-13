import { describe, expect, it } from "vitest"
import { validatePersonReview } from "./review-person"

describe("person manual review", () => {
  it("marks a person as human reviewed without inferring new data", () => {
    expect(validatePersonReview({ personId: "person-1", role: "Gerente de Compras", seniority: "gerencia", icp: true })).toEqual({
      cargo: "Gerente de Compras",
      senioridade: "gerencia",
      icp: true,
      icp_motivo: "revisao_manual",
      revisado_por_humano: true,
    })
  })

  it("rejects invalid seniority values", () => {
    expect(() => validatePersonReview({ personId: "person-1", role: "", seniority: "lideranca" as "gerencia", icp: false })).toThrow("Senioridade inválida")
  })
})
