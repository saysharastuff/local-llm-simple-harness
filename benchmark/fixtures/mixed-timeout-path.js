import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadConfiguration({
  baseDir,
  userFileName,
  remoteConfigUrl,
  fetchImpl = fetch,
}) {
  const localPath = join(baseDir, userFileName);
  const response = await fetchImpl(remoteConfigUrl);

  if (!response.ok) {
    throw new Error(`remote config failed with HTTP ${response.status}`);
  }

  const [localText, remoteText] = await Promise.all([
    readFile(localPath, "utf8"),
    response.text(),
  ]);

  return { localText, remoteText };
}
