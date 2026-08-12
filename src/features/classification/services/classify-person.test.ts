import { describe, expect, it } from "vitest"

import { classifyPerson } from "./classify-person"

describe("classifyPerson", () => {
  it("classifies a Brazilian procurement manager with a company as ICP", () => {
    expect(classifyPerson({ headline: "Procurement Manager", empresa: "Empresa Brasil" })).toEqual({
      senioridade: "gerencia",
      icp: true,
      icpMotivo: "aderente",
    })
  })

  it("prioritizes consulting exclusion over role seniority", () => {
    expect(classifyPerson({ headline: "Partner e consultor de procurement", empresa: "Consultoria" }).icpMotivo).toBe("consultoria")
  })

  it("rejects profiles without a company", () => {
    expect(classifyPerson({ headline: "Head of Sourcing" })).toMatchObject({ icp: false, icpMotivo: "sem_empresa" })
  })

  it("normalizes accents when identifying the role", () => {
    expect(classifyPerson({ headline: "Diretora de Compras", empresa: "Indústria" })).toMatchObject({ senioridade: "diretoria", icp: true })
  })
})
