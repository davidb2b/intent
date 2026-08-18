const ENGINE_BUDGET_UNITS: Record<string, number> = {
  semear_radar: 5,
  vigiar_pessoa: 1,
  varrer_empresa: 5,
  varrer_post: 10,
}

export function engineBudgetUnits(jobType: string) {
  return ENGINE_BUDGET_UNITS[jobType] ?? 0
}
