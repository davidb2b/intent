type FunctionErrorLike = {
  message?: unknown
  context?: unknown
}

function isResponseLike(value: unknown): value is { clone: () => { json: () => Promise<unknown> } } {
  return typeof value === "object" && value !== null
    && "clone" in value
    && typeof (value as { clone?: unknown }).clone === "function"
}

/** Reads an Edge Function error without assuming that Supabase always returns a Response. */
export async function functionErrorMessage(error: unknown, fallback: string) {
  const value = error as FunctionErrorLike
  if (isResponseLike(value?.context)) {
    try {
      const body = await value.context.clone().json() as { error?: unknown }
      if (typeof body.error === "string" && body.error.trim()) return body.error
    } catch {
      // The transport error message below is still useful when the body is not JSON.
    }
  }

  const message = typeof value?.message === "string" ? value.message.trim() : ""
  // Supabase may hide the body when an Edge Function times out or returns a
  // non-2xx response. Never show that transport jargon to a product user.
  if (!message || /edge function returned a non-2xx|failed to send a request|fetch failed/i.test(message)) return fallback
  return message
}
