import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readRequestedFile(rootDirectory, requestPath) {
  const filePath = join(rootDirectory, requestPath);
  return readFile(filePath, "utf8");
}

export function buildRequestHeaders(apiKey, logger = console) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  logger.debug("outbound request", { headers });

  return headers;
}
