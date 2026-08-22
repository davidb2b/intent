import { describe, expect, it } from "vitest"
import { evaluateIntentV2BinaryGate } from "./intent-v2-binary-gate.ts"

const buyer = { cargos: ["CTO", "Diretor de Tecnologia"] }

describe("evaluateIntentV2BinaryGate", () => {
  it("aprova uma pessoa no Brasil com cargo aderente", () => {
    expect(evaluateIntentV2BinaryGate({ buyer, country: "Brasil", title: "CTO" })).toMatchObject({ approved: true, reason: "aprovado" })
  })

  it("recusa quando o Brasil não está confirmado", () => {
    expect(evaluateIntentV2BinaryGate({ buyer, country: "Portugal", title: "CTO" })).toMatchObject({ approved: false, reason: "localizacao_nao_confirmada_no_brasil" })
  })

  it("recusa um perfil excluído mesmo com cargo aderente", () => {
    expect(evaluateIntentV2BinaryGate({ buyer, country: "BR", title: "CTO", excluded: true })).toMatchObject({ approved: false, reason: "perfil_excluido_pelo_icp" })
  })

  it("recusa cargo fora do perfil ideal", () => {
    expect(evaluateIntentV2BinaryGate({ buyer, country: "Brazil", title: "Gerente de RH" })).toMatchObject({ approved: false, reason: "cargo_fora_do_perfil_ideal" })
  })
})
