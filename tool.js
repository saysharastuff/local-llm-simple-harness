import process from "node:process";
import { getDecisionConfig, requestDecision } from "./lib/decision-client.js";
import {
  buildToolDecisionRequest,
  selectToolCategory,
} from "./lib/tool-catalog.js";
import { executeTool } from "./lib/tools.js";

function printHelp() {
  console.log(`Usage:
  node --env-file=.env tool.js <query>

The Decision Engine ranks the bounded tool catalog. The harness applies
deterministic routing policy and executes only a known local tool.

Environment:
  HARNESS_DECISION_MODE       Must be assist or required.
  HARNESS_DECISION_URL        Decision Engine base URL.
  HARNESS_DECISION_TIMEOUT_MS Optional timeout.
  HARNESS_DECISION_TRACE      Print ranking to stderr when true.
  HARNESS_PROJECT_ROOT        Root searched by project_search (default: cwd).
  HARNESS_DOC_ROOT            Root searched by doc_search (default: project root).`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const query = argv.join(" ").trim();
  if (!query) {
    throw new Error("Missing tool query. Use --help for usage.");
  }

  const decisionConfig = getDecisionConfig();
  if (decisionConfig.mode === "off") {
    throw new Error(
      "Tool routing requires HARNESS_DECISION_MODE=assist or required.",
    );
  }

  const decisionResult = await requestDecision({
    baseUrl: decisionConfig.baseUrl,
    request: buildToolDecisionRequest(query),
    timeoutMs: decisionConfig.timeoutMs,
  });

  const selectedTool = selectToolCategory(decisionResult);

  if (decisionConfig.trace) {
    process.stderr.write(
      `Decision Engine tool route: ${JSON.stringify({
        ranking: decisionResult.ranking,
        selectedTool,
      })}\n`,
    );
  }

  if (!selectedTool) {
    process.stdout.write(
      `${JSON.stringify({
        selectedTool: null,
        reason: "ambiguous-or-weak-routing-evidence",
        ranking: decisionResult.ranking,
      }, null, 2)}\n`,
    );
    return;
  }

  const projectRoot = process.env.HARNESS_PROJECT_ROOT ?? process.cwd();
  const docRoot = process.env.HARNESS_DOC_ROOT ?? projectRoot;
  const result = await executeTool(selectedTool, query, {
    projectRoot,
    docRoot,
  });

  process.stdout.write(
    `${JSON.stringify({ selectedTool, result }, null, 2)}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
