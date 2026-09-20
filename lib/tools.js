import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const MAX_SEARCH_FILES = 500;
const MAX_TEXT_FILE_BYTES = 128 * 1024;
const DEFAULT_MAX_RESULTS = 8;
const PROJECT_CONTEXT_RADIUS = 3;
const PROJECT_CONTEXT_MAX_CHARS = 1200;

const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
]);

const PROJECT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rst",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const DOC_EXTENSIONS = new Set([".adoc", ".md", ".rst", ".txt"]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "our",
  "the",
  "this",
  "to",
  "what",
  "where",
  "which",
  "with",
]);

function tokenize(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .match(/[a-z0-9_.-]+/g)
        ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [],
    ),
  ];
}

function countOccurrences(text, token) {
  let count = 0;
  let start = 0;

  while (true) {
    const index = text.indexOf(token, start);
    if (index < 0) {
      return count;
    }
    count += 1;
    start = index + token.length;
  }
}

async function listTextFiles(root, extensions) {
  const rootPath = resolve(root);
  const files = [];
  const queue = [rootPath];

  while (queue.length > 0 && files.length < MAX_SEARCH_FILES) {
    const directory = queue.shift();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= MAX_SEARCH_FILES) {
        break;
      }

      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (
        extensions.has(extension) ||
        entry.name === "Dockerfile" ||
        entry.name === "README"
      ) {
        files.push(fullPath);
      }
    }
  }

  return { rootPath, files };
}

async function readSmallTextFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size > MAX_TEXT_FILE_BYTES) {
    return null;
  }

  return readFile(filePath, "utf8");
}

export async function currentDate({ now = new Date() } = {}) {
  return {
    iso: now.toISOString(),
    local: now.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

class ArithmeticParser {
  constructor(text) {
    this.text = text.replace(/\s+/g, "");
    this.index = 0;
  }

  parse() {
    const value = this.parseExpression();
    if (this.index !== this.text.length) {
      throw new Error("Unsupported calculator expression.");
    }
    if (!Number.isFinite(value)) {
      throw new Error("Calculator result is not finite.");
    }
    return value;
  }

  peek() {
    return this.text[this.index];
  }

  consume(character) {
    if (this.peek() === character) {
      this.index += 1;
      return true;
    }
    return false;
  }

  parseExpression() {
    let value = this.parseTerm();

    while (true) {
      if (this.consume("+")) {
        value += this.parseTerm();
      } else if (this.consume("-")) {
        value -= this.parseTerm();
      } else {
        return value;
      }
    }
  }

  parseTerm() {
    let value = this.parsePower();

    while (true) {
      if (this.consume("*")) {
        value *= this.parsePower();
      } else if (this.consume("/")) {
        const divisor = this.parsePower();
        if (divisor === 0) {
          throw new Error("Division by zero.");
        }
        value /= divisor;
      } else if (this.consume("%")) {
        const divisor = this.parsePower();
        if (divisor === 0) {
          throw new Error("Modulo by zero.");
        }
        value %= divisor;
      } else {
        return value;
      }
    }
  }

  parsePower() {
    const base = this.parseUnary();
    if (this.consume("^")) {
      return base ** this.parsePower();
    }
    return base;
  }

  parseUnary() {
    if (this.consume("+")) {
      return this.parseUnary();
    }
    if (this.consume("-")) {
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.consume("(")) {
      const value = this.parseExpression();
      if (!this.consume(")")) {
        throw new Error("Unclosed calculator parenthesis.");
      }
      return value;
    }

    const remainder = this.text.slice(this.index);
    const match = remainder.match(/^\d+(?:\.\d+)?/);
    if (!match) {
      throw new Error("Expected a number in calculator expression.");
    }

    this.index += match[0].length;
    return Number(match[0]);
  }
}

function extractExpression(query) {
  let text = query.toLowerCase();

  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:percent|%)\s+of\s+(\d+(?:\.\d+)?)/g,
    "(($1/100)*$2)",
  );
  text = text.replace(/(\d+(?:\.\d+)?)\s+squared\b/g, "($1^2)");
  text = text.replace(/(\d+(?:\.\d+)?)\s+cubed\b/g, "($1^3)");

  const binaryPatterns = [
    [/add\s+(-?\d+(?:\.\d+)?)\s+(?:and|to)\s+(-?\d+(?:\.\d+)?)/, "$1+$2"],
    [/subtract\s+(-?\d+(?:\.\d+)?)\s+from\s+(-?\d+(?:\.\d+)?)/, "$2-$1"],
    [/multiply\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)/, "$1*$2"],
    [/divide\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)/, "$1/$2"],
  ];

  for (const [pattern, replacement] of binaryPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }

  text = text
    .replace(/multiplied\s+by/g, "*")
    .replace(/divided\s+by/g, "/")
    .replace(/\btimes\b/g, "*")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\bmod(?:ulo)?\b/g, "%");

  const candidates = text.match(/[0-9+\-*/%^().\s]+/g) ?? [];
  const expression = candidates
    .map((candidate) => candidate.trim())
    .filter((candidate) => /\d/.test(candidate) && /[+\-*/%^]/.test(candidate))
    .sort((a, b) => b.length - a.length)[0];

  if (!expression) {
    throw new Error(
      "Calculator needs an arithmetic expression with numbers and operators.",
    );
  }

  return expression.replace(/\.(?!\d)$/, "");
}

export function calculate(query) {
  const expression = extractExpression(query);
  const value = new ArithmeticParser(expression).parse();
  return { expression, value };
}

function projectWindow(lines, index) {
  const start = Math.max(0, index - PROJECT_CONTEXT_RADIUS);
  const end = Math.min(lines.length, index + PROJECT_CONTEXT_RADIUS + 1);
  return { start, end, lines: lines.slice(start, end) };
}

function buildProjectContext(lines, index) {
  const window = projectWindow(lines, index);

  return window.lines
    .map((line, offset) => `${window.start + offset + 1}: ${line}`)
    .join("\n")
    .slice(0, PROJECT_CONTEXT_MAX_CHARS);
}

function isCommentOnlyLine(line) {
  const value = line.trim();
  return (
    value.startsWith("//") ||
    value.startsWith("#") ||
    value.startsWith("/*") ||
    value.startsWith("*") ||
    value === "*/"
  );
}

function normalizeCommentLine(line) {
  const text = line
    .trim()
    .replace(/^\/\/\s?/, "")
    .replace(/^#\s?/, "")
    .replace(/^\/\*+\s?/, "")
    .replace(/^\*+\s?/, "")
    .replace(/\*\/$/, "")
    .trim();

  if (!text) {
    return "";
  }

  const seen = new Set();
  const words = text.split(/\s+/);
  const normalized = [];

  for (const word of words) {
    const key = word.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(word);
  }

  return normalized.join(" ");
}

function inferProjectStructure(lines, index) {
  const window = projectWindow(lines, index);
  const candidates = window.lines
    .map((line, offset) => ({
      line,
      index: window.start + offset,
      distance: Math.abs(window.start + offset - index),
    }))
    .sort((a, b) => a.distance - b.distance);

  const patterns = [
    {
      kind: "function",
      pattern:
        /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: "class",
      pattern: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: "function",
      pattern:
        /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    },
    {
      kind: "constant",
      pattern: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/,
    },
    {
      kind: "function",
      pattern: /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/,
    },
    {
      kind: "class",
      pattern: /^\s*class\s+([A-Za-z_][\w]*)\b/,
    },
  ];

  for (const candidate of candidates) {
    for (const { kind, pattern } of patterns) {
      const match = candidate.line.match(pattern);
      if (match) {
        return { kind, symbol: match[1] };
      }
    }
  }

  return { kind: "code", symbol: null };
}

function buildProjectSemanticContext(lines, index) {
  return projectWindow(lines, index)
    .lines.map((line) =>
      isCommentOnlyLine(line)
        ? `comment: ${normalizeCommentLine(line)}`
        : `code: ${line.trimEnd()}`,
    )
    .filter((line) => !line.endsWith(": "))
    .join("\n")
    .slice(0, PROJECT_CONTEXT_MAX_CHARS);
}

export async function projectSearch(
  query,
  { root = process.cwd(), maxResults = DEFAULT_MAX_RESULTS } = {},
) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  const { rootPath, files } = await listTextFiles(root, PROJECT_EXTENSIONS);
  const matches = [];

  for (const filePath of files) {
    const contents = await readSmallTextFile(filePath).catch(() => null);
    if (contents === null) {
      continue;
    }

    const rel = relative(rootPath, filePath);
    const lowerPath = rel.toLowerCase();
    const lines = contents.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      let score = 0;

      for (const token of tokens) {
        score += countOccurrences(lowerPath, token) * 4;
        score += Math.min(3, countOccurrences(lowerLine, token));
      }

      if (score > 0) {
        const structure = inferProjectStructure(lines, index);
        matches.push({
          path: rel,
          line: index + 1,
          snippet: line.trim().slice(0, 240),
          context: buildProjectContext(lines, index),
          semanticContext: buildProjectSemanticContext(lines, index),
          kind: structure.kind,
          symbol: structure.symbol,
          score,
        });
      }
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, maxResults);
}

function chunkDocument(contents, maxChars = 1200) {
  const paragraphs = contents
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < paragraph.length; index += maxChars) {
        chunks.push(paragraph.slice(index, index + maxChars));
      }
      continue;
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export async function docSearch(
  query,
  { root = process.cwd(), maxResults = DEFAULT_MAX_RESULTS } = {},
) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const { rootPath, files } = await listTextFiles(root, DOC_EXTENSIONS);
  const chunks = [];

  for (const filePath of files) {
    const contents = await readSmallTextFile(filePath).catch(() => null);
    if (contents === null) {
      continue;
    }

    const rel = relative(rootPath, filePath);
    chunkDocument(contents).forEach((text, index) => {
      chunks.push({
        path: rel,
        chunk: index,
        text,
        lower: text.toLowerCase(),
      });
    });
  }

  const documentFrequency = new Map();
  for (const token of queryTokens) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.lower.includes(token)) {
        count += 1;
      }
    }
    documentFrequency.set(token, count);
  }

  return chunks
    .map((chunk) => {
      let score = 0;
      for (const token of queryTokens) {
        const frequency = countOccurrences(chunk.lower, token);
        if (frequency === 0) {
          continue;
        }

        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log((chunks.length + 1) / (df + 1)) + 1;
        score += (1 + Math.log(frequency)) * idf;
      }

      return {
        path: chunk.path,
        chunk: chunk.chunk,
        text: chunk.text.slice(0, 1200),
        score,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, maxResults);
}

export async function executeTool(
  toolId,
  query,
  { projectRoot = process.cwd(), docRoot = projectRoot, now = new Date() } = {},
) {
  switch (toolId) {
    case "date":
      return currentDate({ now });
    case "calculator":
      return calculate(query);
    case "project_search":
      return projectSearch(query, { root: projectRoot });
    case "doc_search":
      return docSearch(query, { root: docRoot });
    default:
      throw new Error(`Unknown tool: ${toolId}`);
  }
}
