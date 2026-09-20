import { readFileSync } from "node:fs";

const catalogUrl = new URL("../config/tools.json", import.meta.url);

export const TOOL_CHOICES = Object.freeze(
  JSON.parse(readFileSync(catalogUrl, "utf8")).map((choice) =>
    Object.freeze({
      ...choice,
      exemplars: Object.freeze([...(choice.exemplars ?? [])]),
    }),
  ),
);

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(ordered.length / 2);

  if (ordered.length % 2 === 1) {
    return ordered[midpoint];
  }

  return (ordered[midpoint - 1] + ordered[midpoint]) / 2;
}

export function buildToolDecisionRequest(query) {
  return {
    state: query,
    choices: TOOL_CHOICES,
    metadata: {
      task: "tool-route",
    },
  };
}

export function selectToolCategory(
  result,
  { minTopSpread = 0.05, minTopMargin = 0.02 } = {},
) {
  if (!Array.isArray(result?.ranking) || result.ranking.length < 2) {
    return null;
  }

  const ranking = result.ranking
    .map((item) => ({ ...item, score: Number(item.score) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  if (ranking.length < 2) {
    return null;
  }

  const baseline = median(ranking.map((item) => item.score));
  const top = ranking[0];
  const second = ranking[1];

  if (top.score - baseline < minTopSpread) {
    return null;
  }

  if (top.score - second.score < minTopMargin) {
    return null;
  }

  return top.choice_id;
}
