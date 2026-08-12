export function normalizeProfileSlug(url: string) {
  const match = url.match(/\/in\/([^/?#]+)/i)
  const value = match?.[1] ?? url.split("/").filter(Boolean).pop() ?? ""
  return decodeURIComponent(value).toLowerCase().replace(/\/$/, "")
}

export function profileUsername(url: string) {
  return normalizeProfileSlug(url)
}
