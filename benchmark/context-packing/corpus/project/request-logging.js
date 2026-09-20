export function logRequest(logger, headers) {
  // Debug logging records method and URL only. Request headers are excluded.
  logger.debug("request", { method: "POST", url: "/chat/completions" });
}
