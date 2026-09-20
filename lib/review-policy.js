export const REVIEW_LENSES = [
  {
    id: "correctness",
    description: "Logic bugs, incorrect behavior, and edge cases",
    exemplars: [
      "Find bugs in this code",
      "Check whether the implementation is correct",
      "Could this produce the wrong result?",
      "What edge case could change the behavior?",
    ],
  },
  {
    id: "async",
    description: "Async control flow, promises, cancellation, races, and cleanup",
    exemplars: [
      "Review asynchronous behavior",
      "Check cancellation and concurrency",
      "Does this stop cleanly when cancelled?",
      "Could an in-flight operation keep running or race?",
    ],
  },
  {
    id: "reliability",
    description: "Error handling, timeouts, bounded retries, and failure recovery",
    exemplars: [
      "Review error handling",
      "Look for failure modes",
      "Could a slow dependency hang this operation?",
      "What happens after repeated failures or lost error details?",
    ],
  },
  {
    id: "security",
    description: "Unsafe input, injection, secrets, path escape, and trust boundaries",
    exemplars: [
      "Review security",
      "Look for unsafe handling of untrusted input",
      "Can a user-controlled path escape its allowed directory?",
      "Could external input expose data, cross a trust boundary, or leak a secret?",
    ],
  },
  {
    id: "performance",
    description: "Unnecessary work, memory growth, latency, and scalability",
    exemplars: [
      "Review performance",
      "Look for inefficient behavior",
      "Could this repeat expensive work unnecessarily?",
      "Could memory, latency, or resource use grow unexpectedly?",
    ],
  },
  {
    id: "maintainability",
    description: "Clarity, coupling, duplication, and change risk",
    exemplars: [
      "Review maintainability",
      "Look for brittle design",
      "Would this be difficult to change safely?",
      "Is the design unclear, duplicated, or tightly coupled?",
    ],
  },
];

const GUIDANCE = {
  correctness:
    "logic correctness, edge cases, and demonstrated behavioral bugs",
  async:
    "asynchronous control flow, cancellation, promises, races, and cleanup",
  reliability:
    "error propagation, timeouts, bounded resources, and failure recovery",
  security:
    "trust boundaries, untrusted input, injection, secrets, and unsafe assumptions",
  performance: "avoidable work, memory growth, latency, and scalability risks",
  maintainability:
    "clarity, coupling, duplication, and change-sensitive design",
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function buildDecisionRequest(reviewRequest) {
  return {
    state: reviewRequest,
    choices: REVIEW_LENSES,
    metadata: {
      task: "single-file-review",
    },
  };
}

export function selectReviewLenses(
  result,
  {
    maxLenses = 2,
    minTopSpread = 0.05,
    minRelativeScore = 0.75,
    minSecondarySpread = 0.05,
  } = {},
) {
  if (!Array.isArray(result?.ranking) || result.ranking.length < 2) {
    return [];
  }

  const ranking = result.ranking
    .map((item) => ({ ...item, score: Number(item.score) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  if (ranking.length < 2) {
    return [];
  }

  const baseline = median(ranking.map((item) => item.score));
  const top = ranking[0];

  if (top.score - baseline < minTopSpread) {
    return [];
  }

  const selected = [top.choice_id];

  for (const candidate of ranking.slice(1)) {
    if (selected.length >= maxLenses) {
      break;
    }

    if (
      candidate.score >= top.score * minRelativeScore &&
      candidate.score - baseline >= minSecondarySpread
    ) {
      selected.push(candidate.choice_id);
    }
  }

  return selected;
}

export function buildReviewGuidance(lenses) {
  const lines = (lenses ?? []).map((id) => GUIDANCE[id]).filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return [
    "Pay particular attention to the following review lenses:",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}
