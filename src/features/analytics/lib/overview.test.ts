import { describe, expect, it } from "vitest"

import { getOverviewMetrics, getTopCompanies, getUsefulComments } from "./overview"

describe("overview derivation", () => {
  it("uses only real collected entities and excludes generic comments from the investigation preview", () => {
    const posts = [
      { id: "post-1", authorName: "Ana", authorUrl: "https://linkedin.com/in/ana", curationStatus: "aprovado" },
      { id: "post-2", authorName: "Bruno", authorUrl: "https://linkedin.com/in/bruno", curationStatus: "pendente" },
    ] as never
    const sources = [{ id: "source-1", linkedinUrl: "https://linkedin.com/in/ana", name: "Ana", status: "monitorada" }] as never
    const comments = [
      { id: "comment-1", tone: "pratica", text: "Comentário útil" },
      { id: "comment-2", tone: "generico", text: "Comentário genérico" },
      { id: "comment-3", tone: null, text: "Ainda pendente" },
    ] as never
    const companies = [
      { id: "company-1", name: "Empresa menor", people: 1, comments: 1 },
      { id: "company-2", name: "Empresa maior", people: 2, comments: 3 },
    ] as never

    expect(getOverviewMetrics(posts, sources, comments, companies)).toEqual({
      initialResults: 2,
      approvedPosts: 1,
      monitoredAuthors: 1,
      analyzedComments: 2,
      identifiedCompanies: 2,
    })
    expect(getUsefulComments(comments).map((comment) => comment.id)).toEqual(["comment-1"])
    expect(getTopCompanies(companies).map((company) => company.id)).toEqual(["company-2", "company-1"])
  })

  it("shows discovered sources as initial results before monitoring has collected posts", () => {
    const sources = [
      { id: "source-1", linkedinUrl: "https://linkedin.com/in/ana", name: "Ana", status: "candidata" },
      { id: "source-2", linkedinUrl: "https://linkedin.com/in/bruno", name: "Bruno", status: "candidata" },
    ] as never

    expect(getOverviewMetrics([], sources, [], []).initialResults).toBe(2)
  })
})
