/**
 * Client-side auth token management.
 *
 * The web server generates a random bearer token at launch and passes it to
 * the browser via the URL fragment (e.g. `http://127.0.0.1:3000/#token=<hex>`).
 * Fragments are never sent in HTTP requests or logged by servers/proxies,
 * keeping the token local to the machine.
 *
 * On first load this module extracts the token from the fragment, stores it
 * in memory, and clears the fragment from the address bar. All subsequent
 * API calls attach the token via the `Authorization: Bearer` header.
 *
 * For EventSource (SSE), which cannot send custom headers, the token is
 * appended as a `?_token=` query parameter instead.
 */

let cachedToken: string | null = null

/**
 * Extract the auth token from the URL fragment on first call, then return
 * the cached value. Clears the fragment from the address bar.
 */
export function getAuthToken(): string | null {
  if (cachedToken !== null) return cachedToken

  if (typeof window === "undefined") return null

  const hash = window.location.hash
  if (hash) {
    const match = hash.match(/token=([a-fA-F0-9]+)/)
    if (match) {
      cachedToken = match[1]
      // Clear the fragment so the token isn't visible in the address bar
      // or leaked via the Referer header on external navigations.
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }

  return cachedToken
}

/**
 * Returns an object with the `Authorization` header for use with `fetch()`.
 * Merges with any additional headers provided.
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken()
  const headers: Record<string, string> = { ...extra }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return headers
}

/**
 * Wrapper around `fetch()` that automatically injects the auth token.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  if (!token) return fetch(input, init)

  const headers = new Headers(init?.headers)
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}

/**
 * Append the auth token as a `_token` query parameter to a URL string.
 * Used for EventSource connections which cannot send custom headers.
 */
export function appendAuthParam(url: string): string {
  const token = getAuthToken()
  if (!token) return url

  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}_token=${token}`
}
