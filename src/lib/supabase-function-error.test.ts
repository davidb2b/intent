import { describe, expect, it } from "vitest"

import { functionErrorMessage } from "./supabase-function-error"

describe("functionErrorMessage", () => {
  it("keeps the transport message when context is not a Response", async () => {
    await expect(functionErrorMessage({ message: "Falha na função", context: { status: 502 } }, "Fallback")).resolves.toBe("Falha na função")
  })

  it("prefers the explicit error returned by an Edge Function", async () => {
    const context = { clone: () => ({ json: async () => ({ error: "Limite de custo atingido" }) }) }
    await expect(functionErrorMessage({ message: "Erro genérico", context }, "Fallback")).resolves.toBe("Limite de custo atingido")
  })
})

describe("functionErrorMessage transport failures", () => {
  it("replaces an Edge Function transport error with a product-safe fallback", async () => {
    await expect(functionErrorMessage({ message: "Edge Function returned a non-2xx status code" }, "A descoberta não foi concluída.")).resolves.toBe("A descoberta não foi concluída.")
  })
})
