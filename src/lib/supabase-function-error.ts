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

  return typeof value?.message === "string" && value.message.trim() ? value.message : fallback
}
