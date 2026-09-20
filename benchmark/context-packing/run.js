import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { docSearch, projectSearch } from "../../lib/tools.js";

const DEFAULT_MANIFEST = "benchmark/context-packing/manifest.json";
const DEFAULT_CORPUS = "benchmark/context-packing/corpus";
const DEFAULT_OUTPUT = "context-packing-results.json";
const MAX_RETRIEVAL_RESULTS = 12;

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function itemKey(tool, item) {
  if (tool === "project_search") {
    return `${item.path}:${item.line}`;
  }
  return `${item.path}:${item.chunk}`;
}

function itemText(tool, item) {
  return tool === "project_search" ? item.snippet : item.text;
}

function collapseByPath(items) {
  const best = new Map();
  for (const item of items) {
    const current = best.get(item.path);
    if (!current || item.score > current.score) {
      best.set(item.path, item);
    }
  }
  return [...best.values()].sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
}

async function retrieve(tool, query, root) {
  if (tool === "project_search") {
    return projectSearch(query, { root, maxResults: MAX_RETRIEVAL_RESULTS });
  }
  if (tool === "doc_search") {
    return docSearch(query, { root, maxResults: MAX_RETRIEVAL_RESULTS });
  }
  throw new Error(`Unsupported retrieval tool: ${tool}`);
}

function packBudgeted(tool, items, budgetTokens) {
  const selected = [];
  let tokens = 0;

  for (const item of collapseByPath(items)) {
    const cost = estimateTokens(itemText(tool, item));
    if (tokens + cost > budgetTokens) {
      continue;
    }
    selected.push(item);
    tokens += cost;
  }

  return { selected, tokens };
}

function packFacetAware(tool, facetResults, budgetTokens) {
  const selected = [];
  const usedPaths = new Set();
  let tokens = 0;

  const rankedFacets = facetResults.map((entry) => ({
    facet: entry.facet,
    items: collapseByPath(entry.items),
  }));

  // Coverage pass: give every clarified facet a chance to contribute one
  // distinct item before any facet can consume the remaining budget.
  for (const entry of rankedFacets) {
    const candidate = entry.items.find((item) => !usedPaths.has(item.path));
    if (!candidate) {
      continue;
    }

    const cost = estimateTokens(itemText(tool, candidate));
    if (tokens + cost > budgetTokens) {
      continue;
    }

    selected.push({ ...candidate, facet: entry.facet });
    usedPaths.add(candidate.path);
    tokens += cost;
  }

  const remaining = rankedFacets
    .flatMap((entry) =>
      entry.items.map((item) => ({ ...item, facet: entry.facet })),
    )
    .filter((item) => !usedPaths.has(item.path))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  for (const item of remaining) {
    if (usedPaths.has(item.path)) {
      continue;
    }
    const cost = estimateTokens(itemText(tool, item));
    if (tokens + cost > budgetTokens) {
      continue;
    }
    selected.push(item);
    usedPaths.add(item.path);
    tokens += cost;
  }

  return { selected, tokens };
}

function clarify(state) {
  const whole = state.replace(/\s+/g, " ").trim();
  const split = whole.split(
    /(?:[.!?;]+\s+|\s+(?:and whether|and|or|but|plus)\s+)/i,
  );
  const facets = [];
  const seen = new Set();

  for (const part of split) {
    const facet = part.replace(/^[ ,.;:!?]+|[ ,.;:!?]+$/g, "");
    if (facet.split(/\s+/).length < 3) {
      continue;
    }
    const key = facet.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      facets.push(facet);
    }
  }

  return facets.length > 1 ? facets : [whole];
}

function evaluate(requiredPaths, selected, tokens, budgetTokens) {
  const selectedPaths = [...new Set(selected.map((item) => item.path))];
  const required = new Set(requiredPaths);
  const hits = selectedPaths.filter((path) => required.has(path));
  const noise = selectedPaths.filter((path) => !required.has(path));

  return {
    evidenceRecall: hits.length / required.size,
    evidenceHits: hits,
    missingEvidence: requiredPaths.filter(
      (path) => !selectedPaths.includes(path),
    ),
    selectedPaths,
    noisePaths: noise,
    noiseRate:
      selectedPaths.length === 0 ? 0 : noise.length / selectedPaths.length,
    tokens,
    budgetTokens,
    tokenUtilization: tokens / budgetTokens,
  };
}

async function main() {
  const manifestPath = resolve(process.argv[2] ?? DEFAULT_MANIFEST);
  const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);
  const corpusRoot = resolve(DEFAULT_CORPUS);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const scenarios = [];

  for (const scenario of manifest.scenarios) {
    const wholeResults = await retrieve(
      scenario.tool,
      scenario.query,
      corpusRoot,
    );
    const wholePack = packBudgeted(
      scenario.tool,
      wholeResults,
      manifest.budgetTokens,
    );

    const facets = clarify(scenario.query);
    const facetResults = [];
    for (const facet of facets) {
      facetResults.push({
        facet,
        items: await retrieve(scenario.tool, facet, corpusRoot),
      });
    }

    const facetPack = packFacetAware(
      scenario.tool,
      facetResults,
      manifest.budgetTokens,
    );

    scenarios.push({
      id: scenario.id,
      tool: scenario.tool,
      query: scenario.query,
      requiredPaths: scenario.requiredPaths,
      facets,
      wholeQuery: evaluate(
        scenario.requiredPaths,
        wholePack.selected,
        wholePack.tokens,
        manifest.budgetTokens,
      ),
      facetAware: evaluate(
        scenario.requiredPaths,
        facetPack.selected,
        facetPack.tokens,
        manifest.budgetTokens,
      ),
    });
  }

  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const output = {
    budgetTokens: manifest.budgetTokens,
    metrics: {
      wholeQueryEvidenceRecall: mean(
        scenarios.map((item) => item.wholeQuery.evidenceRecall),
      ),
      facetAwareEvidenceRecall: mean(
        scenarios.map((item) => item.facetAware.evidenceRecall),
      ),
      wholeQueryNoiseRate: mean(
        scenarios.map((item) => item.wholeQuery.noiseRate),
      ),
      facetAwareNoiseRate: mean(
        scenarios.map((item) => item.facetAware.noiseRate),
      ),
      wholeQueryMeanTokens: mean(
        scenarios.map((item) => item.wholeQuery.tokens),
      ),
      facetAwareMeanTokens: mean(
        scenarios.map((item) => item.facetAware.tokens),
      ),
    },
    scenarios,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify(output.metrics, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(
    `Context packing benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
