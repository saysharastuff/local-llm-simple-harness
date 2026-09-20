export async function fetchJson(
  url,
  { timeoutMs = 5000, signal, fetchImpl = fetch } = {},
) {
  const controller = new AbortController();
  let timedOut = false;

  const forwardAbort = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `request failed with HTTP ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && timedOut) {
      throw new Error(`request timed out after ${timeoutMs} ms`, {
        cause: error,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
