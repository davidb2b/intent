import { Check, RefreshCw, Save, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { onboardingNotice, productErrorMessage } from "@/lib/product-messages"
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
    try { await onSave(icp); setDirty(false); setMessage("Tudo certo. Suas alterações foram salvas.") } catch (error) { setMessage(productErrorMessage(error, "Não conseguimos salvar suas alterações agora. Tente novamente em alguns instantes.")) }
  }
  const activate = async () => {
    setMessage("")
    try {
      if (dirty) await onSave(icp)
      await onActivate(icp)
    } catch (error) { setMessage(productErrorMessage(error, "Não conseguimos ativar seu perfil ideal agora. Seus dados estão salvos; tente novamente em alguns instantes.")) }
  }
  const regenerate = async () => {
    setMessage("")
    try { await onRegenerate() } catch (error) { setMessage(productErrorMessage(error, "Não conseguimos criar uma nova versão agora. A versão atual continua segura.")) }
  }

  const firmography = icp.company.firmografia
  const reviewNotice = onboardingNotice(warning)
  return <section className="intent-icp-main">
    <div className="intent-icp-container">
      <header className="intent-page-heading">
        <div><h1>Perfil de cliente ideal</h1><p>Defina quem tem maior potencial de compra e quais comportamentos indicam o momento certo para uma abordagem.</p></div>
        <div className="intent-page-actions"><span className={`intent-version-badge ${icp.status === "ativo" ? "is-active" : ""}`}>{icp.status === "ativo" ? "Ativo" : icp.status === "arquivado" ? "Arquivado" : "Em revisão"} · v{icp.version}</span><Button disabled={Boolean(busy)} onClick={regenerate} size="sm" variant="outline"><RefreshCw className={busy === "regenerating" ? "intent-spin" : ""} size={14} /> Gerar nova versão</Button></div>
      </header>

      <section className={`intent-activation-banner ${icp.status === "ativo" ? "is-active" : ""}`}>
        <div><Sparkles size={18} /><p><strong>{icp.status === "ativo" ? `Versão ${icp.version} ativa.` : `Versão ${icp.version} pronta para revisão.`}</strong> {icp.status === "ativo" ? "O Intent já usa estas definições para priorizar pessoas e empresas." : "Revise as informações abaixo e ative quando estiver seguro de que elas representam seu melhor cliente."}</p></div>
        {editable && <Button disabled={Boolean(busy)} onClick={activate}>{busy === "activating" ? <Spinner label="Ativando o perfil ideal" /> : <Check size={15} />}{busy === "activating" ? "Ativando…" : "Ativar perfil ideal"}</Button>}
      </section>
      {reviewNotice && <p className="intent-warning"><strong>Vale revisar:</strong> {reviewNotice}</p>}
      {message && <p aria-live="polite" className={`intent-editor-message ${/não|inválid|erro/i.test(message) ? "is-error" : ""}`}>{message}</p>}

      <section className="intent-icp-section">
        <header><span>🏢</span><div><h2>Sua empresa</h2><p>O contexto que ajuda o Intent a reconhecer oportunidades alinhadas ao seu negócio.</p></div></header>
        <div className="intent-card">
          <label className="intent-profile-field">Resumo da empresa<textarea disabled={!editable} value={icp.companySummary} onChange={(event) => change((next) => { next.companySummary = event.target.value; next.company.empresa_resumo = event.target.value })} /></label>
          <div className="intent-two-columns">
            <div><div className="intent-field-heading"><strong>Dados confirmados da empresa</strong></div><dl className="intent-firmography"><div><dt>Empresa</dt><dd>{firmography.nome}</dd></div><div><dt>Setor</dt><dd>{firmography.industria_literal}</dd></div><div><dt>Porte</dt><dd>{firmography.faixa_funcionarios}</dd></div><div><dt>Fundação</dt><dd>{firmography.fundada_em ?? "Não confirmada"}</dd></div><div><dt>Localização</dt><dd>{firmography.sede}</dd></div><div><dt>País</dt><dd>{firmography.pais}</dd></div></dl></div>
            <EditableList disabled={!editable} label="Dores que você resolve" maxItems={8} onChange={(values) => change((next) => { next.company.dores_resolvidas = values })} values={icp.company.dores_resolvidas} variant="rows" />
          </div>
        </div>
      </section>

      <section className="intent-icp-section">
        <header><span>👤</span><div><h2>Quem tem maior potencial de compra</h2><p>Cargos, setores, portes e critérios que ajudam a manter o foco nas melhores oportunidades.</p></div></header>
        <div className="intent-card intent-buyer-card">
          <EditableList disabled={!editable} label="Cargos" maxItems={20} onChange={(values) => change((next) => { next.buyer.cargos = values })} placeholder="Adicionar cargo..." values={icp.buyer.cargos} />
          <div className="intent-two-columns">
            <EditableList disabled={!editable} label="Setores" maxItems={20} onChange={(values) => change((next) => { next.buyer.setores = values.map((label, index) => ({ familia: next.buyer.setores[index]?.familia ?? "outros", label_linkedin: label })) })} placeholder="Adicionar setor..." values={icp.buyer.setores.map((item) => item.label_linkedin)} />
            <EditableList disabled={!editable} label="Porte (funcionários)" maxItems={9} onChange={(values) => change((next) => { next.buyer.portes = values as typeof next.buyer.portes })} placeholder="Ex.: 201-500" values={[...icp.buyer.portes]} />
          </div>
          <div className="intent-two-columns">
            <EditableList disabled={!editable} label="Região" maxItems={20} onChange={(values) => change((next) => { next.buyer.regioes = values })} placeholder="Adicionar região..." values={icp.buyer.regioes} />
            <EditableList disabled={!editable} label="Exclusões" minItems={5} maxItems={30} onChange={(values) => change((next) => { next.buyer.exclusoes = values.map((value, index) => next.buyer.exclusoes[index] ? { ...next.buyer.exclusoes[index], valor: value } : { tipo: "concorrente", valor: value, motivo: "Exclusão definida pelo usuário" }) })} placeholder="Adicionar exclusão..." values={icp.buyer.exclusoes.map((item) => item.valor)} variant="exclusions" />
          </div>
        </div>
      </section>

      <section className="intent-icp-section">
        <header><span>📈</span><div><h2>Como reconhecer o momento certo</h2><p>Problemas, mudanças e assuntos que revelam quando uma oportunidade merece prioridade.</p></div></header>
        <div className="intent-two-columns">
          <div className="intent-card"><EditableList disabled={!editable} label="Problemas que mobilizam" minItems={8} maxItems={8} onChange={(values) => change((next) => { next.buyingSignals.dores = values })} values={icp.buyingSignals.dores} variant="rows" /></div>
          <div className="intent-card"><EditableList disabled={!editable} label="Gatilhos de compra" minItems={8} maxItems={8} onChange={(values) => change((next) => { next.buyingSignals.gatilhos = values })} values={icp.buyingSignals.gatilhos} variant="rows" /></div>
        </div>
        <div className="intent-card"><EditableList disabled={!editable} label="Assuntos que merecem atenção" maxItems={12} onChange={(values) => change((next) => { next.buyingSignals.temas = values })} placeholder="Adicionar assunto..." values={icp.buyingSignals.temas} /></div>
        <div className="intent-card"><div className="intent-field-heading"><strong>Concorrentes</strong><span>{icp.buyingSignals.concorrentes.length}</span></div><p className="intent-helper">Ajudam a evitar falsos positivos e a reconhecer conversas relevantes para o seu mercado.</p><div className="intent-competitor-list">{icp.buyingSignals.concorrentes.map((competitor, index) => <div className="intent-competitor-row" key={`${competitor.dominio}-${index}`}><Input aria-label={`Nome do concorrente ${index + 1}`} disabled={!editable} value={competitor.nome} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].nome = event.target.value })} /><Input aria-label={`Domínio do concorrente ${index + 1}`} disabled={!editable} value={competitor.dominio} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].dominio = event.target.value })} /><Input aria-label={`Motivo do concorrente ${index + 1}`} disabled={!editable} value={competitor.motivo} onChange={(event) => change((next) => { next.buyingSignals.concorrentes[index].motivo = event.target.value })} /></div>)}</div></div>
        <div className="intent-card"><div className="intent-field-heading"><strong>Critérios de prioridade</strong><span>{icp.buyingSignals.regras.length}</span></div><p className="intent-helper">Definem quais sinais merecem atenção primeiro.</p><div className="intent-rule-list">{icp.buyingSignals.regras.map((rule, index) => <div className="intent-rule-row" key={`${rule.nome}-${index}`}><div><Input aria-label={`Nome da regra ${index + 1}`} disabled={!editable} value={rule.nome} onChange={(event) => change((next) => { next.buyingSignals.regras[index].nome = event.target.value })} /><select aria-label={`Prioridade da regra ${index + 1}`} disabled={!editable} value={rule.prioridade} onChange={(event) => change((next) => { next.buyingSignals.regras[index].prioridade = event.target.value as "High" | "Medium" })}><option value="High">Alta</option><option value="Medium">Média</option></select></div><Input aria-label={`Descrição da regra ${index + 1}`} disabled={!editable} value={rule.descricao} onChange={(event) => change((next) => { next.buyingSignals.regras[index].descricao = event.target.value })} /></div>)}</div></div>
      </section>

      {editable && <div className="intent-save-bar"><div><strong>{dirty ? "Você tem alterações para salvar" : "Todas as alterações estão salvas"}</strong><span>Estas definições começam a orientar as prioridades depois da ativação.</span></div><Button disabled={!dirty || Boolean(busy)} onClick={save} variant="outline">{busy === "saving" ? <Spinner label="Salvando alterações" /> : <Save size={15} />}{busy === "saving" ? "Salvando…" : "Salvar alterações"}</Button></div>}
    </div>
  </section>
}
