export const REVIEW_LENSES = [
  {
    id: "correctness",
    description: "Logic bugs, incorrect behavior, and edge cases",
    exemplars: [
      "Find bugs in this code",
      "Check whether the implementation is correct",
    ],
  },
  {
    id: "async",
    description: "Async control flow, promises, cancellation, and races",
    exemplars: [
      "Review asynchronous behavior",
      "Check cancellation and concurrency",
    ],
  },
  {
    id: "reliability",
    description: "Error handling, timeouts, and failure recovery",
    exemplars: ["Review error handling", "Look for failure modes"],
  },
  {
    id: "security",
    description: "Unsafe input, injection, secrets, and trust boundaries",
    exemplars: [
      "Review security",
      "Look for unsafe handling of untrusted input",
    ],
  },
  {
    id: "performance",
    description: "Unnecessary work, memory growth, latency, and scalability",
    exemplars: ["Review performance", "Look for inefficient behavior"],
  },
  {
    id: "maintainability",
    description: "Clarity, coupling, duplication, and change risk",
    exemplars: ["Review maintainability", "Look for brittle design"],
  },
];

const GUIDANCE = {
  correctness:\n    "logic correctness, edge cases, and demonstrated behavioral bugs",
  async:\n    "asynchronous control flow, cancellation, promises, races, and cleanup",
  reliability:\n    "error propagation, timeouts, bounded resources, and failure recovery",
  security:\n    "trust boundaries, untrusted input, injection, secrets, and unsafe assumptions",
  performance: "avoidable work, memory growth, latency, and scalability risks",
  maintainability:\n    "clarity, coupling, duplication, and change-sensitive design",
};

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
    minScore = 0.35,
    minRelativeScore = 0.7,
  } = {},
) {
  if (!Array.isArray(result?.ranking) || result.ranking.length === 0) {
    return [];
  }

  const ranking = [...result.ranking].sort((a, b) => b.score - a.score);
  const topScore = Number(ranking[0]?.score ?? 0);

  if (!Number.isFinite(topScore) || topScore < minScore) {
    return [];
  }

  return ranking
    .filter((item) => {
      const score = Number(item.score);
      return (
        Number.isFinite(score) &&
        score >= minScore &&
        score >= topScore * minRelativeScore
      );
    })
    .slice(0, maxLenses)
    .map((item) => item.choice_id);
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
