/**
 * In the Tauri desktop build, the webview has no Vite proxy, so API calls must
 * target the local Flask sidecar. Dev browser mode keeps relative URLs.
 */
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (apiBaseUrl) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/")) {
      return originalFetch(`${apiBaseUrl}${input}`, init);
    }
    return originalFetch(input, init);
  };
}
