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

      // Intentional benchmark defects:
      // - the original error details are discarded;
      // - every non-abort failure retries forever.
      log.warn("request failed; retrying");
    }
  }
}
