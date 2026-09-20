import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_MANIFEST = "benchmark/manifest.json";
const DEFAULT_RESULTS_DIR = "benchmark-results";
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

function sanitizeId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function runReview({ file, reviewRequest, decisionMode, decisionTrace }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();
    const child = spawn(process.execPath, ["review.js", file, reviewRequest], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HARNESS_DECISION_MODE: decisionMode,
        HARNESS_DECISION_TRACE: decisionTrace ? "true" : "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let captureError = null;

    function capture(chunk, chunks, currentBytes, label) {
      const nextBytes = currentBytes + chunk.length;
      if (nextBytes > MAX_CAPTURE_BYTES) {
        captureError = new Error(
          `${label} exceeded ${MAX_CAPTURE_BYTES} bytes`,
        );
        child.kill("SIGTERM");
        return { nextBytes };
      }
      chunks.push(chunk);
      return { nextBytes };
    }

    child.stdout.on("data", (chunk) => {
      const result = capture(chunk, stdoutChunks, stdoutBytes, "stdout");
      stdoutBytes = result.nextBytes;
    });

    child.stderr.on("data", (chunk) => {
      const result = capture(chunk, stderrChunks, stderrBytes, "stderr");
      stderrBytes = result.nextBytes;
    });

    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (captureError) {
        rejectPromise(captureError);
        return;
      }

      resolvePromise({
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

async function loadManifest(path) {
  const text = await readFile(path, "utf8");
  const manifest = JSON.parse(text);

  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    throw new Error("Benchmark manifest must contain at least one scenario.");
  }

  return manifest;
}

function extractDecisionTrace(stderr) {
  const prefix = "Decision Engine: ";
  const line = stderr
    .split(/\r?\n/)
    .find((item) => item.startsWith(prefix));

  if (!line) {
    return null;
  }

  try {
    return JSON.parse(line.slice(prefix.length));
  } catch {
    return null;
  }
}

async function writeRunFiles(baseDir, run) {
  await mkdir(baseDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(baseDir, "review.md"), run.stdout, "utf8"),
    writeFile(resolve(baseDir, "stderr.txt"), run.stderr, "utf8"),
    writeFile(
      resolve(baseDir, "run.json"),
      JSON.stringify(
        {
          exitCode: run.exitCode,
          signal: run.signal,
          durationMs: run.durationMs,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    ),
  ]);
}

async function main() {
  const manifestPath = resolve(process.argv[2] ?? DEFAULT_MANIFEST);
  const resultsDir = resolve(process.argv[3] ?? DEFAULT_RESULTS_DIR);
  const manifest = await loadManifest(manifestPath);

  await mkdir(resultsDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    modelId: process.env.HARNESS_MODEL_ID ?? null,
    decisionUrl: process.env.HARNESS_DECISION_URL ?? null,
    scenarios: [],
  };

  let failed = false;

  for (const scenario of manifest.scenarios) {
    const id = sanitizeId(scenario.id);
    const scenarioDir = resolve(resultsDir, id);
    const fixturePath = resolve(scenario.file);

    process.stdout.write(`Running ${scenario.id}: baseline...\n`);
    const baseline = await runReview({
      file: fixturePath,
      reviewRequest: scenario.reviewRequest,
      decisionMode: "off",
      decisionTrace: false,
    });

    process.stdout.write(`Running ${scenario.id}: assisted...\n`);
    const assisted = await runReview({
      file: fixturePath,
      reviewRequest: scenario.reviewRequest,
      decisionMode: "required",
      decisionTrace: true,
    });

    await writeRunFiles(resolve(scenarioDir, "baseline"), baseline);
    await writeRunFiles(resolve(scenarioDir, "assisted"), assisted);

    const decisionTrace = extractDecisionTrace(assisted.stderr);
    await writeFile(
      resolve(scenarioDir, "scenario.json"),
      JSON.stringify(
        {
          ...scenario,
          fixturePath: scenario.file,
          baseline: {
            exitCode: baseline.exitCode,
            durationMs: baseline.durationMs,
          },
          assisted: {
            exitCode: assisted.exitCode,
            durationMs: assisted.durationMs,
          },
          decisionTrace,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    summary.scenarios.push({
      id: scenario.id,
      title: scenario.title,
      expectedLenses: scenario.expectedLenses,
      plantedFindingIds: scenario.plantedFindings.map((finding) => finding.id),
      baselineExitCode: baseline.exitCode,
      assistedExitCode: assisted.exitCode,
      baselineDurationMs: baseline.durationMs,
      assistedDurationMs: assisted.durationMs,
      selectedLenses: decisionTrace?.selectedLenses ?? [],
    });

    if (baseline.exitCode !== 0 || assisted.exitCode !== 0) {
      failed = true;
    }
  }

  await writeFile(
    resolve(resultsDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8",
  );

  if (failed) {
    throw new Error("One or more benchmark runs failed; see benchmark-results.");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Benchmark failed: ${message}\n`);
  process.exitCode = 1;
});
