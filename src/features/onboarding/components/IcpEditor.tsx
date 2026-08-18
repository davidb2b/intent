import { Check, LoaderCircle, RefreshCw, Save, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IcpRecord } from "../domain/onboarding"
import { EditableList } from "./EditableList"

type Props = {
  initialIcp: IcpRecord
  warning: string | null
  busy: "saving" | "activating" | "regenerating" | null
  onSave: (icp: IcpRecord) => Promise<void>
  onActivate: (icp: IcpRecord) => Promise<void>
  onRegenerate: () => Promise<void>
}

function copyIcp(icp: IcpRecord): IcpRecord {
  return structuredClone(icp)
}

export function IcpEditor({ initialIcp, warning, busy, onSave, onActivate, onRegenerate }: Props) {
  const [icp, setIcp] = useState(() => copyIcp(initialIcp))
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState("")
  const editable = icp.status === "rascunho"

  useEffect(() => { setIcp(copyIcp(initialIcp)); setDirty(false); setMessage("") }, [initialIcp])

  const change = (update: (next: IcpRecord) => void) => {
    if (!editable) return
    setIcp((current) => { const next = copyIcp(current); update(next); return next })
    setDirty(true)
    setMessage("")
  }
  const save = async () => {
    setMessage("")
    try { await onSave(icp); setDirty(false); setMessage("Alterações salvas.") } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar.") }
  }
  const activate = async () => {
    setMessage("")
    try {
      if (dirty) await onSave(icp)
      await onActivate(icp)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível ativar o ICP.") }
  }
  const regenerate = async () => {
    setMessage("")
    try { await onRegenerate() } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível regenerar o ICP.") }
  }

  const firmography = icp.company.firmografia
  return <main className="intent-icp-main">
    <div className="intent-icp-container">
      <header className="intent-page-heading">
        <div><h1>ICP</h1><p>Uma definição só, com tudo dentro: quem é o seu comprador e como reconhecer que ele está em momento de compra. Gerado do seu site — edite e ative.</p></div>
        <div className="intent-page-actions"><span className={`intent-version-badge ${icp.status === "ativo" ? "is-active" : ""}`}>{icp.status === "ativo" ? "Ativo" : icp.status === "arquivado" ? "Arquivado" : "Rascunho"} · v{icp.version}</span><Button disabled={Boolean(busy)} onClick={regenerate} size="sm" variant="outline"><RefreshCw className={busy === "regenerating" ? "intent-spin" : ""} size={14} /> Regenerar</Button></div>
      </header>

      <section className={`intent-activation-banner ${icp.status === "ativo" ? "is-active" : ""}`}>
        <div><Sparkles size={18} /><p><strong>{icp.status === "ativo" ? `ICP v${icp.version} ativo.` : `ICP v${icp.version} em rascunho.`}</strong> {icp.status === "ativo" ? "O Intent já pode buscar e julgar pessoas com esta definição." : "Ao ativar, o Intent começa a buscar pessoas — e tudo que encontrar será julgado por esta definição."}</p></div>
        {editable && <Button disabled={Boolean(busy)} onClick={activate}>{busy === "activating" ? <LoaderCircle className="intent-spin" size={15} /> : <Check size={15} />}Ativar ICP v{icp.version}</Button>}
      </section>
      {warning && <p className="intent-warning">Análise parcial: {warning}</p>}
      {message && <p aria-live="polite" className={`intent-editor-message ${/não|inválid|erro/i.test(message) ? "is-error" : ""}`}>{message}</p>}

      <section className="intent-icp-section">
        <header><span>🏢</span><div><h2>Sua empresa</h2><p>O que o Intent entendeu do seu site — este resumo participa de todo julgamento.</p></div></header>
        <div className="intent-card">
          <label className="intent-profile-field">Resumo da empresa<textarea disabled={!editable} value={icp.companySummary} onChange={(event) => change((next) => { next.companySummary = event.target.value; next.company.empresa_resumo = event.target.value })} /></label>
          <div className="intent-two-columns">
            <div><div className="intent-field-heading"><strong>Firmografia (LinkedIn oficial)</strong></div><dl className="intent-firmography"><div><dt>Empresa</dt><dd>{firmography.nome}</dd></div><div><dt>Indústria</dt><dd>{firmography.industria_literal}</dd></div><div><dt>Porte</dt><dd>{firmography.faixa_funcionarios}</dd></div><div><dt>Fundação</dt><dd>{firmography.fundada_em ?? "Não confirmada"}</dd></div><div><dt>Sede</dt><dd>{firmography.sede}</dd></div><div><dt>País</dt><dd>{firmography.pais}</dd></div></dl></div>
            <EditableList label="Dores que você resolve" maxItems={8} onChange={(values) => change((next) => { next.company.dores_resolvidas = values })} values={icp.company.dores_resolvidas} variant="rows" />
          </div>
        </div>
      </section>

      <section className="intent-icp-section">
        <header><span>👤</span><div><h2>Quem é o seu comprador</h2><p>Cargo, setor, porte, região — e quem nunca deve virar lead.</p></div></header>
        <div className="intent-card intent-buyer-card">
          <EditableList label="Cargos" maxItems={20} onChange={(values) => change((next) => { next.buyer.cargos = values })} placeholder="Adicionar cargo..." values={icp.buyer.cargos} />
          <div className="intent-two-columns">
            <EditableList label="Setores" maxItems={20} onChange={(values) => change((next) => { next.buyer.setores = values.map((label, index) => ({ familia: next.buyer.setores[index]?.familia ?? "outros", label_linkedin: label })) })} placeholder="Adicionar setor..." values={icp.buyer.setores.map((item) => item.label_linkedin)} />
            <EditableList label="Porte (funcionários)" maxItems={9} onChange={(values) => change((next) => { next.buyer.portes = values as typeof next.buyer.portes })} placeholder="Ex.: 201-500" values={[...icp.buyer.portes]} />
          </div>
          <div className="intent-two-columns">
            <EditableList label="Região" maxItems={20} onChange={(values) => change((next) => { next.buyer.regioes = values })} placeholder="Adicionar região..." values={icp.buyer.regioes} />
            <EditableList label="Exclusões" minItems={5} maxItems={30} onChange={(values) => change((next) => { next.buyer.exclusoes = values.map((value, index) => next.buyer.exclusoes[index] ? { ...next.buyer.exclusoes[index], valor: value } : { tipo: "concorrente", valor: value, motivo: "Exclusão definida pelo usuário" }) })} placeholder="Adicionar exclusão..." values={icp.buyer.exclusoes.map((item) => item.valor)} variant="exclusions" />
          </div>
        </div>
      </section>

      <section className="intent-icp-section">
        <header><span>📈</span><div><h2>Como reconhecer que ele está comprando</h2><p>O que torna um comportamento relevante — dores, gatilhos, temas, concorrentes e regras de prioridade.</p></div></header>
        <div className="intent-two-columns">
          <div className="intent-card"><EditableList label="Dores do comprador" minItems={8} maxItems={8} onChange={(values) => change((next) => { next.buyingSignals.dores = values })} values={icp.buyingSignals.dores} variant="rows" /></div>
          <div className="intent-card"><EditableList label="Gatilhos de compra" minItems={8} maxItems={8} onChange={(values) => change((next) => { next.buyingSignals.gatilhos = values })} values={icp.buyingSignals.gatilhos} variant="rows" /></div>
        </div>
        <div className="intent-card"><EditableList label="Temas relevantes" maxItems={12} onChange={(values) => change((next) => { next.buyingSignals.temas = values })} placeholder="Adicionar tema..." values={icp.buyingSignals.temas} /></div>
        <div className="intent-card"><div className="intent-field-heading"><strong>Concorrentes</strong><span>{icp.buyingSignals.concorrentes.length}</span></div><p className="intent-helper">Entram na watchlist e na exclusão de leads.</p><div className="intent-competitor-list">{icp.buyingSignals.concorrentes.map((competitor, index) => <div className="intent-competitor-row" key={`${competitor.dominio}-${index}`}><Input aria-label={`Nome do concorrente ${index + 1}`} disabled={!editable} value={competitor.nome} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].nome = event.target.value })} /><Input aria-label={`Domínio do concorrente ${index + 1}`} disabled={!editable} value={competitor.dominio} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].dominio = event.target.value })} /><Input aria-label={`Motivo do concorrente ${index + 1}`} disabled={!editable} value={competitor.motivo} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].motivo = event.target.value })} /></div>)}</div></div>
        <div className="intent-card"><div className="intent-field-heading"><strong>Regras de prioridade</strong><span>{icp.buyingSignals.regras.length}</span></div><p className="intent-helper">O que faz uma pessoa subir na fila.</p><div className="intent-rule-list">{icp.buyingSignals.regras.map((rule, index) => <div className="intent-rule-row" key={`${rule.nome}-${index}`}><div><Input aria-label={`Nome da regra ${index + 1}`} disabled={!editable} value={rule.nome} onChange={(event) => change((next) => { next.buyingSignals.regras[index].nome = event.target.value })} /><select aria-label={`Prioridade da regra ${index + 1}`} disabled={!editable} value={rule.prioridade} onChange={(event) => change((next) => { next.buyingSignals.regras[index].prioridade = event.target.value as "High" | "Medium" })}><option>High</option><option>Medium</option></select></div><Input aria-label={`Descrição da regra ${index + 1}`} disabled={!editable} value={rule.descricao} onChange={(event) => change((next) => { next.buyingSignals.regras[index].descricao = event.target.value })} /></div>)}</div></div>
      </section>

      {editable && <div className="intent-save-bar"><div><strong>{dirty ? "Alterações ainda não salvas" : "Rascunho sincronizado"}</strong><span>O conteúdo só passa a julgar sinais depois da ativação.</span></div><Button disabled={!dirty || Boolean(busy)} onClick={save} variant="outline">{busy === "saving" ? <LoaderCircle className="intent-spin" size={15} /> : <Save size={15} />}Salvar alterações</Button></div>}
    </div>
  </main>
}
