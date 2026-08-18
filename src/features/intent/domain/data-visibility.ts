export const CLIENT_VISIBLE_PERSON_COLUMNS = [
  "id",
  "projeto_id",
  "empresa_id",
  "linkedin_url",
  "nome",
  "headline",
  "cargo",
  "intencao",
  "status",
  "ultimo_sinal_em",
  "email_disponivel",
  "telefone_disponivel",
] as const;

export const PRIVATE_PERSON_COLUMNS = [
  "fit",
  "origem",
  "apollo_id",
  "email",
  "telefone",
] as const;

export const SERVER_ONLY_TABLES = [
  "pessoa_contatos_privados",
  "pessoa_operacao_privada",
  "jobs",
  "integracao_raw_payloads",
  "custos",
] as const;

export const CLIENT_VISIBLE_STATUSES = ["lead", "sinal_fraco", "cliente"] as const;
export const AUDIT_ONLY_STATUS = "fora_icp" as const;
export const SERVER_ONLY_STATUS = "vigiado" as const;

export function canClientReadPersonStatus(status: string, includeAudit = false): boolean {
  if ((CLIENT_VISIBLE_STATUSES as readonly string[]).includes(status)) return true;
  return includeAudit && status === AUDIT_ONLY_STATUS;
}

export function isServerOnlyTable(table: string): boolean {
  return (SERVER_ONLY_TABLES as readonly string[]).includes(table);
}
