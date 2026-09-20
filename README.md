# local-llm-simple-harness

Small Node.js learning project for sending one file and one review request to a local OpenAI-compatible model.

## Requirements

- Node.js 22+
- No external runtime dependencies

## First milestone: one script

The script `review.js` does exactly one request:

1. Reads one file you choose.
2. Combines it with your review request.
3. Calls your configured local `/chat/completions` endpoint.
4. Prints plain-text Markdown output.

## Configure environment

Do not commit secrets. `.env` is already ignored by Git.

PowerShell setup:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and set at least:

```dotenv
HARNESS_MODEL_BASE_URL=http://127.0.0.1:11434/v1
HARNESS_MODEL_ID=local-model
HARNESS_MODEL_API_KEY=
HARNESS_MODEL_AUTH_SCHEME=bearer
HARNESS_MODEL_TIMEOUT_MS=180000
```

Notes:

- `HARNESS_MODEL_BASE_URL` can include a path prefix like `/v1`; the script appends `chat/completions` correctly.
- `HARNESS_MODEL_API_KEY` is optional for local providers.
- `HARNESS_MODEL_AUTH_SCHEME` supports `bearer` (default) and `basic-password`.
- For llama-swap setups that work with `curl -u ":$K"`, use `HARNESS_MODEL_AUTH_SCHEME=basic-password`.

## Usage

```powershell
node --env-file=.env review.js ./review.js "Review error handling and asynchronous behavior."
```

Help:

```powershell
node review.js --help
```

## Optional Decision Engine assistance

This fork can ask a separate Decision Engine to rank bounded review lenses before calling the generation model. The harness still owns policy and the model still performs the review.

For today's hosted test deployment:

```dotenv
HARNESS_DECISION_MODE=assist
HARNESS_DECISION_URL=https://sayshara-decision-engine.hf.space
HARNESS_DECISION_TIMEOUT_MS=5000
HARNESS_DECISION_TRACE=true
```

Modes:

- `off`: original harness behavior.
- `assist`: use Decision Engine guidance when available, otherwise fall back to original behavior.
- `required`: fail if Decision Engine is unavailable or returns an invalid response.

The Decision Engine returns a ranking rather than authority. The harness selects up to two strong review lenses and converts them into deterministic prompt guidance.

### A/B test

Run the same file, review request, and model twice.

Baseline:

```powershell
$env:HARNESS_DECISION_MODE="off"
node --env-file=.env review.js ./review.js "Review error handling and asynchronous behavior."
```

Assisted:

```powershell
$env:HARNESS_DECISION_MODE="assist"
$env:HARNESS_DECISION_TRACE="true"
node --env-file=.env review.js ./review.js "Review error handling and asynchronous behavior."
```

On bash/zsh:

```bash
HARNESS_DECISION_MODE=off node --env-file=.env review.js ./review.js "Review error handling and asynchronous behavior."

HARNESS_DECISION_MODE=assist \
HARNESS_DECISION_TRACE=true \
node --env-file=.env review.js ./review.js "Review error handling and asynchronous behavior."
```

Decision traces are written to stderr so stdout remains only the model's review output.

Run `npm test` and `npm run format:check` before merging.

## Experimental bounded tools

The harness also includes a small deterministic tool surface for testing semantic
routing independently from generation:

- `date`: current date/time context.
- `calculator`: safe arithmetic parser with no `eval`.
- `project_search`: bounded local source/file search.
- `doc_search`: bounded retrieval of relevant documentation chunks for RAG.

The Decision Engine ranks only these declared tools. The harness owns the allowed
roots, routing policy, and execution. The Decision Engine does not invent tool
names, paths, permissions, or arguments.

Example:

```bash
HARNESS_DECISION_MODE=required \
HARNESS_DECISION_TRACE=true \
node --env-file=.env tool.js "Where is selectReviewLenses defined?"
```

Set `HARNESS_PROJECT_ROOT` and `HARNESS_DOC_ROOT` to constrain the search
surface. Both default to the current working directory.

Tool-routing benchmark prompts live in
`benchmark/tool-routing/manifest.json`.
