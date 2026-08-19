export type ContactType = "email" | "telefone"

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function firstText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const direct = text(item)
      if (direct) return direct
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        const nested = text(record.sanitized_number) ?? text(record.raw_number) ?? text(record.number) ?? text(record.value)
        if (nested) return nested
      }
    }
  }
  return null
}

export function extractApolloContact(payload: Record<string, unknown>, type: ContactType): string | null {
  const person = payload.person && typeof payload.person === "object" && !Array.isArray(payload.person)
    ? payload.person as Record<string, unknown>
    : payload

  if (type === "email") {
    return text(person.email) ?? text(person.email_address) ?? firstText(person.personal_emails)
  }

  return text(person.phone_number) ?? text(person.phone) ?? firstText(person.phone_numbers)
}

function base64Bytes(value: string): Uint8Array {
  const raw = atob(value)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function toBase64(value: Uint8Array): string {
  let raw = ""
  for (const byte of value) raw += String.fromCharCode(byte)
  return btoa(raw)
}

function asBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

async function contactKey(secret: string): Promise<CryptoKey> {
  const bytes = base64Bytes(secret)
  if (bytes.byteLength !== 32) throw new Error("A proteção de contatos não está configurada corretamente.")
  return crypto.subtle.importKey("raw", asBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function encryptContact(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await contactKey(secret), new TextEncoder().encode(value))
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
}

export async function decryptContact(envelope: string, secret: string): Promise<string> {
  const [version, encodedIv, encodedValue] = envelope.split(".")
  if (version !== "v1" || !encodedIv || !encodedValue) throw new Error("O contato protegido não pode ser lido.")
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBuffer(base64Bytes(encodedIv)) }, await contactKey(secret), asBuffer(base64Bytes(encodedValue)))
  return new TextDecoder().decode(decrypted)
}
