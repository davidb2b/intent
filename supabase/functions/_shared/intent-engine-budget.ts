const ENGINE_BUDGET_UNITS: Record<string, number> = {
  // A descoberta inicial usa o limite configurado do projeto e não consome o
  // teto diário reservado para verificar atividades públicas.
  semear_radar: 0,
  vigiar_pessoa: 1,
  varrer_empresa: 5,
  varrer_post: 10,
  varrer_watchlist: 5,
}

export function engineBudgetUnits(jobType: string) {
  return ENGINE_BUDGET_UNITS[jobType] ?? 0
}
