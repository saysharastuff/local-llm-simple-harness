import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadConfiguration({
  baseDir,
  userFileName,
  remoteConfigUrl,
  fetchImpl = fetch,
}) {
  // Intentional benchmark defect: a user-selected filename can contain
  // parent-directory segments and escape baseDir.
  const localPath = join(baseDir, userFileName);

  // Intentional benchmark defect: a slow remote request has no timeout or
  // cancellation mechanism.
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
