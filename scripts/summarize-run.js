#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const runDir = process.argv[2];

if (!runDir) {
  console.error("Usage: summarize-run.js <run-dir>");
  process.exit(1);
}

function round(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseAgentBrowserEnvelope(filePath) {
  const payload = readJson(filePath);
  if (!payload.success) {
    throw new Error(`agent-browser command failed for ${filePath}`);
  }
  return payload.data;
}

function unwrapEvalResult(filePath) {
  const data = parseAgentBrowserEnvelope(filePath);
  if (typeof data.result !== "string") {
    return data.result;
  }
  return JSON.parse(data.result);
}

function bytesToKiB(value) {
  return round(value / 1024);
}

function buildProfileSummary(profile) {
  const events = Array.isArray(profile.traceEvents) ? profile.traceEvents : [];
  const runTasks = events.filter(
    (event) => event.name === "RunTask" && event.ph === "X" && typeof event.dur === "number"
  );
  const durationsMs = runTasks.map((event) => event.dur / 1000);
  const totalMs = durationsMs.reduce((sum, value) => sum + value, 0);
  const longTasks50ms = durationsMs.filter((value) => value >= 50);
  const longTasks100ms = durationsMs.filter((value) => value >= 100);

  return {
    traceEventCount: events.length,
    runTaskCount: runTasks.length,
    totalRunTaskMs: round(totalMs),
    averageRunTaskMs: round(runTasks.length ? totalMs / runTasks.length : 0),
    maxRunTaskMs: round(durationsMs.length ? Math.max(...durationsMs) : 0),
    longTasks50ms: longTasks50ms.length,
    longTasks100ms: longTasks100ms.length,
  };
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function firstNonEmptyLine(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

const request = readJson(path.join(runDir, "request.json"));
const pageMetrics = unwrapEvalResult(path.join(runDir, "page-metrics.raw.json"));
const consoleData = parseAgentBrowserEnvelope(path.join(runDir, "console.raw.json"));
const errorsData = parseAgentBrowserEnvelope(path.join(runDir, "errors.raw.json"));
const profile = readJson(path.join(runDir, "profile.json"));
const profileSummary = buildProfileSummary(profile);
const finalUrl = firstNonEmptyLine(path.join(runDir, "final-url.txt")) || pageMetrics.url;
const title = firstNonEmptyLine(path.join(runDir, "title.txt")) || pageMetrics.title;
const navigationTransferSize = pageMetrics.navigation?.transferSize ?? 0;
const navigationEncodedBodySize = pageMetrics.navigation?.encodedBodySize ?? 0;
const navigationDecodedBodySize = pageMetrics.navigation?.decodedBodySize ?? 0;
const totalTransferSizeBytes = navigationTransferSize + (pageMetrics.resources.transferSize ?? 0);
const totalEncodedBodySizeBytes =
  navigationEncodedBodySize + (pageMetrics.resources.encodedBodySize ?? 0);
const totalDecodedBodySizeBytes =
  navigationDecodedBodySize + (pageMetrics.resources.decodedBodySize ?? 0);

const summary = {
  schemaVersion: 1,
  request,
  page: {
    title,
    finalUrl,
    capturedAt: pageMetrics.capturedAt,
    userAgent: pageMetrics.userAgent,
  },
  timings: {
    responseStartMs: pageMetrics.navigation?.responseStartMs ?? null,
    responseEndMs: pageMetrics.navigation?.responseEndMs ?? null,
    domInteractiveMs: pageMetrics.navigation?.domInteractiveMs ?? null,
    domContentLoadedMs: pageMetrics.navigation?.domContentLoadedMs ?? null,
    loadEventMs: pageMetrics.navigation?.loadEventMs ?? null,
    durationMs: pageMetrics.navigation?.durationMs ?? null,
    firstPaintMs: pageMetrics.paints["first-paint"] ?? null,
    firstContentfulPaintMs: pageMetrics.paints["first-contentful-paint"] ?? null,
  },
  payload: {
    navigationTransferSizeBytes: navigationTransferSize,
    navigationEncodedBodySizeBytes: navigationEncodedBodySize,
    navigationDecodedBodySizeBytes: navigationDecodedBodySize,
    totalTransferSizeBytes,
    totalEncodedBodySizeBytes,
    totalDecodedBodySizeBytes,
  },
  resources: {
    count: pageMetrics.resources.count,
    byInitiator: pageMetrics.resources.byInitiator,
    renderBlockingCount: pageMetrics.resources.renderBlockingCount,
    topByTransfer: pageMetrics.resources.topByTransfer,
    topByDuration: pageMetrics.resources.topByDuration,
  },
  dom: pageMetrics.dom,
  memory: pageMetrics.memory,
  logging: {
    consoleMessages: Array.isArray(consoleData.messages) ? consoleData.messages.length : 0,
    pageErrors: Array.isArray(errorsData.errors) ? errorsData.errors.length : 0,
  },
  profile: profileSummary,
};

writeJson(path.join(runDir, "page-metrics.json"), pageMetrics);
writeJson(path.join(runDir, "console.json"), consoleData);
writeJson(path.join(runDir, "errors.json"), errorsData);
writeJson(path.join(runDir, "summary.json"), summary);

const md = [
  "# Performance Summary",
  "",
  `- Target URL: ${request.targetUrl}`,
  `- Final URL: ${summary.page.finalUrl}`,
  `- Title: ${summary.page.title}`,
  `- Label: ${request.label}`,
  `- Captured At: ${summary.page.capturedAt}`,
  "",
  "## Timings",
  "",
  `- Response end: ${summary.timings.responseEndMs ?? "n/a"} ms`,
  `- DOM interactive: ${summary.timings.domInteractiveMs ?? "n/a"} ms`,
  `- DOMContentLoaded: ${summary.timings.domContentLoadedMs ?? "n/a"} ms`,
  `- Load event: ${summary.timings.loadEventMs ?? "n/a"} ms`,
  `- Navigation duration: ${summary.timings.durationMs ?? "n/a"} ms`,
  `- First paint: ${summary.timings.firstPaintMs ?? "n/a"} ms`,
  `- First contentful paint: ${summary.timings.firstContentfulPaintMs ?? "n/a"} ms`,
  "",
  "## Payload",
  "",
  `- Total transfer: ${bytesToKiB(summary.payload.totalTransferSizeBytes) ?? "n/a"} KiB`,
  `- Total encoded body: ${bytesToKiB(summary.payload.totalEncodedBodySizeBytes) ?? "n/a"} KiB`,
  `- Total decoded body: ${bytesToKiB(summary.payload.totalDecodedBodySizeBytes) ?? "n/a"} KiB`,
  `- Resource count: ${summary.resources.count}`,
  `- Render-blocking resources: ${summary.resources.renderBlockingCount}`,
  "",
  "## Runtime",
  "",
  `- DOM nodes: ${summary.dom.nodes}`,
  `- Images: ${summary.dom.images}`,
  `- Scripts: ${summary.dom.scripts}`,
  `- Stylesheets: ${summary.dom.stylesheets}`,
  `- Console messages: ${summary.logging.consoleMessages}`,
  `- Page errors: ${summary.logging.pageErrors}`,
  "",
  "## Profiler",
  "",
  `- Trace events: ${summary.profile.traceEventCount}`,
  `- RunTask events: ${summary.profile.runTaskCount}`,
  `- Total RunTask time: ${summary.profile.totalRunTaskMs} ms`,
  `- Max RunTask time: ${summary.profile.maxRunTaskMs} ms`,
  `- Long tasks >=50ms: ${summary.profile.longTasks50ms}`,
  `- Long tasks >=100ms: ${summary.profile.longTasks100ms}`,
  "",
  "## Top Resources By Transfer",
  "",
];

for (const entry of summary.resources.topByTransfer.slice(0, 5)) {
  md.push(
    `- ${entry.transferSize} B | ${entry.durationMs ?? "n/a"} ms | ${entry.initiatorType} | ${entry.name}`
  );
}

fs.writeFileSync(path.join(runDir, "summary.md"), `${md.join("\n")}\n`);
console.log(`Summary written to ${path.join(runDir, "summary.json")}`);
