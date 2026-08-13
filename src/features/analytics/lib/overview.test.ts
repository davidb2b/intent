import { describe, expect, it } from "vitest"

import { getOverviewMetrics, getTopCompanies, getUsefulComments } from "./overview"

describe("overview derivation", () => {
  it("uses only real collected entities and prioritizes classified comments in the investigation preview", () => {
    const posts = [
      { id: "post-1", authorName: "Ana", authorUrl: "https://linkedin.com/in/ana", curationStatus: "aprovado" },
      { id: "post-2", authorName: "Bruno", authorUrl: "https://linkedin.com/in/bruno", curationStatus: "pendente" },
    ] as never
    const sources = [{ id: "source-1", linkedinUrl: "https://linkedin.com/in/ana", name: "Ana", status: "monitorada" }] as never
    const comments = [
      { id: "comment-1", tone: "pratica", text: "Comentário útil", personUrl: "https://linkedin.com/in/ana" },
      { id: "comment-2", tone: "generico", text: "Comentário genérico", personUrl: "https://linkedin.com/in/bruno" },
      { id: "comment-3", tone: null, text: "Ainda pendente", personUrl: "https://linkedin.com/in/carla" },
    ] as never
    const companies = [
      { id: "company-1", name: "Empresa menor", people: 1, comments: 1 },
      { id: "company-2", name: "Empresa maior", people: 2, comments: 3 },
    ] as never

    expect(getOverviewMetrics(posts, sources, comments, companies)).toEqual({
      discoveredSources: 1,
      collectedPosts: 2,
      observedPeople: 3,
      collectedComments: 3,
      identifiedCompanies: 2,
    })
    expect(getUsefulComments(comments).map((comment) => comment.id)).toEqual(["comment-1"])
    expect(getTopCompanies(companies).map((company) => company.id)).toEqual(["company-2", "company-1"])
  })

  it("keeps discovered sources visible before monitoring has collected posts", () => {
    const sources = [
      { id: "source-1", linkedinUrl: "https://linkedin.com/in/ana", name: "Ana", status: "candidata" },
      { id: "source-2", linkedinUrl: "https://linkedin.com/in/bruno", name: "Bruno", status: "candidata" },
    ] as never

    expect(getOverviewMetrics([], sources, [], []).discoveredSources).toBe(2)
  })

  it("shows real comments while classification is still pending", () => {
    const comments = [{ id: "comment-1", tone: null, text: "Comentário coletado" }] as never

    expect(getUsefulComments(comments).map((comment) => comment.id)).toEqual(["comment-1"])
  })
})
