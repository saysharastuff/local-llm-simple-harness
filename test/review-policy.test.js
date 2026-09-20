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

test("selectReviewLenses keeps multiple clearly elevated lenses", () => {
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

test("selectReviewLenses rejects flat weak rankings", () => {
  const lenses = selectReviewLenses({
    ranking: [
      { choice_id: "security", score: 0.2 },
      { choice_id: "correctness", score: 0.18 },
      { choice_id: "async", score: 0.17 },
      { choice_id: "reliability", score: 0.16 },
    ],
  });
  assert.deepEqual(lenses, []);
});

test("selectReviewLenses can accept a low absolute score with strong separation", () => {
  const lenses = selectReviewLenses({
    ranking: [
      { choice_id: "security", score: 0.31 },
      { choice_id: "maintainability", score: 0.18 },
      { choice_id: "async", score: 0.08 },
      { choice_id: "reliability", score: 0.03 },
    ],
  });
  assert.deepEqual(lenses, ["security"]);
});

test("buildReviewGuidance is deterministic", () => {
  const guidance = buildReviewGuidance(["async", "reliability"]);
  assert.match(guidance, /asynchronous control flow/);
  assert.match(guidance, /error propagation/);
});
