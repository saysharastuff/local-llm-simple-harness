const DEFAULT_DECISION_TIMEOUT_MS = 5000;

function parsePositiveInt(rawValue, fallback, name) {
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

export function getDecisionConfig(env = process.env) {
  const mode = (env.HARNESS_DECISION_MODE ?? "off").trim().toLowerCase();
  if (!["off", "assist", "required"].includes(mode)) {
    throw new Error(
      "HARNESS_DECISION_MODE must be 'off', 'assist', or 'required'.",
    );
  }

  const baseUrl = (env.HARNESS_DECISION_URL ?? "").trim();
  if (mode !== "off" && !baseUrl) {
    throw new Error(
      "HARNESS_DECISION_URL is required when HARNESS_DECISION_MODE is not 'off'.",
    );
  }

  return {
    mode,
    baseUrl,
    timeoutMs: parsePositiveInt(
      env.HARNESS_DECISION_TIMEOUT_MS,
      DEFAULT_DECISION_TIMEOUT_MS,
      "HARNESS_DECISION_TIMEOUT_MS",
    ),
    trace: (env.HARNESS_DECISION_TRACE ?? "false").trim().toLowerCase() === "true",
  };
}

function buildDecisionUrl(baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("HARNESS_DECISION_URL must be a valid URL.");
  }

  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }

  return new URL("v1/decide", base).toString();
}

export async function requestDecision({
  baseUrl,
  request,
  timeoutMs = DEFAULT_DECISION_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(buildDecisionUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const bodyText = await response.text();

    if (!response.ok) {
      const briefBody = bodyText.slice(0, 300).trim();
      throw new Error(
        briefBody
          ? `Decision Engine request failed with HTTP ${response.status}: ${briefBody}`
          : `Decision Engine request failed with HTTP ${response.status}.`,
      );
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error("Decision Engine returned invalid JSON.");
    }

    if (!Array.isArray(payload?.ranking) || payload.ranking.length === 0) {
      throw new Error("Decision Engine response is missing a non-empty ranking.");
    }

    return payload;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "AbortError"
    ) {
      throw new Error(`Decision Engine request timed out after ${timeoutMs} ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
