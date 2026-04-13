#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log("Usage: compare-runs.js <run-a|summary-a> <run-b|summary-b> [--output-dir <dir>]");
  process.exit(0);
}

if (args.length < 2) {
  console.error("Usage: compare-runs.js <run-a|summary-a> <run-b|summary-b> [--output-dir <dir>]");
  process.exit(1);
}

let outputDir = null;
const positional = [];

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--output-dir") {
    outputDir = args[index + 1];
    index += 1;
    continue;
  }
  positional.push(args[index]);
}

if (positional.length !== 2) {
  console.error("Expected exactly two run directories or summary files.");
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveSummary(input) {
  const resolved = path.resolve(input);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return {
      runDir: resolved,
      summaryPath: path.join(resolved, "summary.json"),
      summary: readJson(path.join(resolved, "summary.json")),
    };
  }
  return {
    runDir: path.dirname(resolved),
    summaryPath: resolved,
    summary: readJson(resolved),
  };
}

function round(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function get(object, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => {
    if (current == null) {
      return null;
    }
    return current[key];
  }, object);
}

function buildDelta(baseValue, candidateValue) {
  if (typeof baseValue !== "number" || typeof candidateValue !== "number") {
    return {
      baseline: baseValue ?? null,
      candidate: candidateValue ?? null,
      delta: null,
      deltaPct: null,
    };
  }

  const delta = candidateValue - baseValue;
  const deltaPct = baseValue === 0 ? null : (delta / baseValue) * 100;
  return {
    baseline: baseValue,
    candidate: candidateValue,
    delta: round(delta),
    deltaPct: round(deltaPct),
  };
}

function renderNumber(value, suffix = "") {
  if (value == null) {
    return "n/a";
  }
  return `${value}${suffix}`;
}

const baseline = resolveSummary(positional[0]);
const candidate = resolveSummary(positional[1]);
const metrics = [
  { key: "timings.responseEndMs", label: "Response end", suffix: " ms" },
  { key: "timings.domContentLoadedMs", label: "DOMContentLoaded", suffix: " ms" },
  { key: "timings.loadEventMs", label: "Load event", suffix: " ms" },
  { key: "timings.firstPaintMs", label: "First paint", suffix: " ms" },
  { key: "timings.firstContentfulPaintMs", label: "First contentful paint", suffix: " ms" },
  { key: "payload.totalTransferSizeBytes", label: "Total transfer", suffix: " B" },
  { key: "resources.count", label: "Resource count", suffix: "" },
  { key: "resources.renderBlockingCount", label: "Render-blocking resources", suffix: "" },
  { key: "logging.consoleMessages", label: "Console messages", suffix: "" },
  { key: "logging.pageErrors", label: "Page errors", suffix: "" },
  { key: "profile.longTasks50ms", label: "Long tasks >=50ms", suffix: "" },
  { key: "profile.maxRunTaskMs", label: "Max RunTask", suffix: " ms" },
];

const comparison = {
  schemaVersion: 1,
  baseline: {
    runDir: baseline.runDir,
    label: baseline.summary.request.label,
    targetUrl: baseline.summary.request.targetUrl,
    finalUrl: baseline.summary.page.finalUrl,
  },
  candidate: {
    runDir: candidate.runDir,
    label: candidate.summary.request.label,
    targetUrl: candidate.summary.request.targetUrl,
    finalUrl: candidate.summary.page.finalUrl,
  },
  metrics: {},
};

for (const metric of metrics) {
  comparison.metrics[metric.key] = {
    label: metric.label,
    suffix: metric.suffix,
    ...buildDelta(get(baseline.summary, metric.key), get(candidate.summary, metric.key)),
  };
}

const md = [
  "# Performance Comparison",
  "",
  `- Baseline: ${baseline.summary.request.label} (${baseline.runDir})`,
  `- Candidate: ${candidate.summary.request.label} (${candidate.runDir})`,
  "",
  "| Metric | Baseline | Candidate | Delta | Delta % |",
  "| --- | ---: | ---: | ---: | ---: |",
];

for (const metric of metrics) {
  const delta = comparison.metrics[metric.key];
  md.push(
    `| ${metric.label} | ${renderNumber(delta.baseline, metric.suffix)} | ${renderNumber(delta.candidate, metric.suffix)} | ${renderNumber(delta.delta, metric.suffix)} | ${renderNumber(delta.deltaPct, "%")} |`
  );
}

const markdown = `${md.join("\n")}\n`;

if (outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "comparison.md"), markdown);
  fs.writeFileSync(path.join(outputDir, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  console.log(`Comparison written to ${outputDir}`);
} else {
  console.log(markdown);
}
