import { describe, expect, it } from "vitest"
import { signalTypeFromPublicActivity } from "./intent-signal-type"

describe("signalTypeFromPublicActivity", () => {
  it("keeps the fixed Intent taxonomy tied to the captured public event", () => {
    expect(signalTypeFromPublicActivity({ kind: "comment", evidence: "Alguém indica um fornecedor para este projeto?" })).toBe("pediu_indicacao")
    expect(signalTypeFromPublicActivity({ kind: "comment", evidence: "Ótima análise sobre o tema." })).toBe("comentou_tema")
    expect(signalTypeFromPublicActivity({ kind: "reaction", evidence: "Post público" })).toBe("atividade_fraca")
    expect(signalTypeFromPublicActivity({ kind: "share", evidence: "Compartilhou uma publicação" })).toBe("compartilhou_tema")
    expect(signalTypeFromPublicActivity({ kind: "job_change", evidence: "Novo cargo público" })).toBe("mudou_cargo")
  })

  it("preserves watchlist context without inventing a private fit score", () => {
    expect(signalTypeFromPublicActivity({ kind: "comment", evidence: "Interessante", sourceRole: "competitor" })).toBe("engajou_concorrente")
    expect(signalTypeFromPublicActivity({ kind: "comment", evidence: "Interessante", sourceRole: "influencer" })).toBe("engajou_influenciador")
  })
})
