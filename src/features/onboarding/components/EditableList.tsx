import { Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  variant?: "chips" | "rows" | "exclusions"
  minItems?: number
  maxItems?: number
  disabled?: boolean
}

export function EditableList({ label, values, onChange, placeholder = "Adicionar item...", variant = "chips", minItems = 1, maxItems = 30, disabled = false }: Props) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const value = draft.trim()
    if (!value || values.includes(value) || values.length >= maxItems) return
    onChange([...values, value])
    setDraft("")
  }
  const remove = (index: number) => {
    if (values.length <= minItems) return
    onChange(values.filter((_, itemIndex) => itemIndex !== index))
  }

  return <div className={`intent-edit-list intent-edit-list-${variant}`}>
    <div className="intent-field-heading"><strong>{label}</strong><span>{values.length}</span></div>
    <div className="intent-edit-values">
      {values.map((value, index) => variant === "rows" ? <div className="intent-edit-row" key={`${value}-${index}`}>
        <span className="intent-list-dot" />
        <Input aria-label={`${label} ${index + 1}`} disabled={disabled} value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
        <button aria-label={`Remover ${value}`} disabled={disabled || values.length <= minItems} onClick={() => remove(index)} type="button"><X size={14} /></button>
      </div> : <span className={`intent-chip ${variant === "exclusions" ? "intent-chip-exclusion" : ""}`} key={`${value}-${index}`}>
        {value}<button aria-label={`Remover ${value}`} disabled={disabled || values.length <= minItems} onClick={() => remove(index)} type="button"><X size={12} /></button>
      </span>)}
    </div>
    {!disabled && variant !== "rows" && values.length < maxItems && <div className="intent-add-row">
      <Input aria-label={`Novo item em ${label}`} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add() } }} />
      <Button onClick={add} size="sm" type="button" variant="outline"><Plus size={14} /> Adicionar</Button>
    </div>}
  </div>
}
