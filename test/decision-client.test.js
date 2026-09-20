import test from "node:test";
import assert from "node:assert/strict";
import { getDecisionConfig, requestDecision } from "../lib/decision-client.js";

test("getDecisionConfig defaults to off", () => {
  assert.deepEqual(getDecisionConfig({}), {
    mode: "off",
    baseUrl: "",
    timeoutMs: 5000,
    trace: false,
  });
});

test("getDecisionConfig requires URL when enabled", () => {
  assert.throws(
    () => getDecisionConfig({ HARNESS_DECISION_MODE: "assist" }),
    /HARNESS_DECISION_URL is required/,
  );
});

test("requestDecision posts to v1 decide", async () => {
  let seen;
  const fakeFetch = async (url, options) => {
    seen = { url, options };
    return new Response(
      JSON.stringify({
        ranking: [{ choice_id: "async", score: 0.9 }],
      }),
      { status: 200 },
    );
  };

  const result = await requestDecision({
    baseUrl: "http://127.0.0.1:8099",
    request: { state: "x", choices: [] },
    fetchImpl: fakeFetch,
  });

  assert.equal(seen.url, "http://127.0.0.1:8099/v1/decide");
  assert.equal(seen.options.method, "POST");
  assert.equal(result.ranking[0].choice_id, "async");
});

test("requestDecision rejects malformed responses", async () => {
  const fakeFetch = async () => new Response("{}", { status: 200 });
  await assert.rejects(
    requestDecision({
      baseUrl: "http://127.0.0.1:8099",
      request: {},
      fetchImpl: fakeFetch,
    }),
    /missing a non-empty ranking/,
  );
});
