import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculate,
  currentDate,
  docSearch,
  executeTool,
  projectSearch,
} from "../lib/tools.js";

test("calculator evaluates arithmetic without eval", () => {
  assert.equal(calculate("Calculate (128 + 64) / 3.").value, 64);
  assert.equal(calculate("What is 15 percent of 240?").value, 36);
  assert.equal(calculate("Add 18.5 and 7.25 for me.").value, 25.75);
});

test("date tool exposes deterministic injected time", async () => {
  const now = new Date("2026-09-20T12:34:56Z");
  const result = await currentDate({ now });
  assert.equal(result.iso, "2026-09-20T12:34:56.000Z");
});

test("project search finds source symbols", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-project-"));
  await writeFile(
    join(root, "router.js"),
    "export function buildDecisionRequest() {}\n",
  );

  const results = await projectSearch("Where is buildDecisionRequest?", {
    root,
  });

  assert.equal(results[0].path, "router.js");
});

test("doc search returns relevant document chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-docs-"));
  await mkdir(join(root, "docs"));
  await writeFile(
    join(root, "docs", "setup.md"),
    "# Setup\n\nConfigure HARNESS_MODEL_BASE_URL before running the harness.\n",
  );
  await writeFile(
    join(root, "docs", "other.md"),
    "# Other\n\nThis document talks about unrelated colors and shapes.\n",
  );

  const results = await docSearch("How do I configure the model endpoint?", {
    root,
  });

  assert.equal(results[0].path, join("docs", "setup.md"));
});

test("executeTool dispatches only known tools", async () => {
  const result = await executeTool("calculator", "37 * 19");
  assert.equal(result.value, 703);

  await assert.rejects(
    () => executeTool("unknown", "anything"),
    /Unknown tool/,
  );
});
