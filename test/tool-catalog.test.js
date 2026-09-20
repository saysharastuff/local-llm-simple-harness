import test from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_CHOICES,
  buildToolDecisionRequest,
  selectToolCategory,
} from "../lib/tool-catalog.js";

test("tool catalog contains the four bounded MVP tools", () => {
  assert.deepEqual(
    TOOL_CHOICES.map((choice) => choice.id),
    ["date", "calculator", "project_search", "doc_search"],
  );
});

test("buildToolDecisionRequest sends bounded tool choices", () => {
  const request = buildToolDecisionRequest("Where is this symbol?");
  assert.equal(request.state, "Where is this symbol?");
  assert.equal(request.metadata.task, "tool-route");
  assert.equal(request.choices.length, 4);
});

test("selectToolCategory selects a clearly separated tool", () => {
  const selected = selectToolCategory({
    ranking: [
      { choice_id: "project_search", score: 0.62 },
      { choice_id: "doc_search", score: 0.42 },
      { choice_id: "calculator", score: 0.18 },
      { choice_id: "date", score: 0.11 },
    ],
  });

  assert.equal(selected, "project_search");
});

test("selectToolCategory abstains on ambiguous top scores", () => {
  const selected = selectToolCategory({
    ranking: [
      { choice_id: "project_search", score: 0.52 },
      { choice_id: "doc_search", score: 0.51 },
      { choice_id: "calculator", score: 0.12 },
      { choice_id: "date", score: 0.1 },
    ],
  });

  assert.equal(selected, null);
});
