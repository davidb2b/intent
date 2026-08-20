import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Spinner } from "./spinner"

describe("Spinner", () => {
  it("announces a localized loading state", () => {
    render(<Spinner label="Preparando sua operação" />)

    expect(screen.getByRole("status", { name: "Preparando sua operação" })).toBeInTheDocument()
  })
})
