import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDecisionRequest,
  buildReviewGuidance,
  selectReviewLenses,
} from "../lib/review-policy.js";

test("buildDecisionRequest includes bounded review choices", () => {
  const request = buildDecisionRequest("Review error handling");
  assert.equal(request.state, "Review error handling");
  assert.ok(request.choices.length >= 4);
  assert.equal(request.metadata.task, "single-file-review");
});

test("selectReviewLenses keeps multiple strong lenses after abstention", () => {
  const lenses = selectReviewLenses({
    decision: null,
    confident: false,
    ranking: [
      { choice_id: "reliability", score: 0.819 },
      { choice_id: "async", score: 0.803 },
      { choice_id: "security", score: 0.504 },
      { choice_id: "correctness", score: 0.323 },
    ],
  });

  assert.deepEqual(lenses, ["reliability", "async"]);
});

test("selectReviewLenses rejects weak rankings", () => {
  const lenses = selectReviewLenses({
    ranking: [
      { choice_id: "security", score: 0.2 },
      { choice_id: "correctness", score: 0.18 },
    ],
  });
  assert.deepEqual(lenses, []);
});

test("buildReviewGuidance is deterministic", () => {
  const guidance = buildReviewGuidance(["async", "reliability"]);
  assert.match(guidance, /asynchronous control flow/);
  assert.match(guidance, /error propagation/);
});
