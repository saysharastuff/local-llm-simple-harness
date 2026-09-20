export async function requestWithRetry(
  url,
  { fetchImpl = fetch, signal, log = console } = {},
) {
  for (;;) {
    try {
      const response = await fetchImpl(url, { signal });

      if (!response.ok) {
        throw new Error(`request failed with HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }

      log.warn("request failed; retrying");
    }
  }
}
