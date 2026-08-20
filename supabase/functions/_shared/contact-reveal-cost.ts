export function contactRevealCredits(type: "email" | "telefone") {
  return type === "telefone" ? 10 : 1
}
