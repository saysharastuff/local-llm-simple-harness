import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readRequestedFile(rootDirectory, requestPath) {
  // Intentional benchmark defect: requestPath is controlled by another app
  // and is not constrained to remain under rootDirectory.
  const filePath = join(rootDirectory, requestPath);
  return readFile(filePath, "utf8");
}

export function buildRequestHeaders(apiKey, logger = console) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Intentional benchmark defect: this writes the secret-bearing header.
  logger.debug("outbound request", { headers });

  return headers;
}
