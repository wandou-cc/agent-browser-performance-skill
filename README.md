# Agent Browser Performance

Detailed Chinese guide: [references/guide-zh.md](./references/guide-zh.md)

`agent-browser-performance` is a Codex skill for collecting repeatable browser-performance artifacts from a URL and comparing runs over time. It standardizes capture commands, artifact paths, and comparison outputs so performance checks are easier to repeat after changes.

## Who This Is For

- People who want a quick page-load baseline before and after a change
- Engineers who need fixed artifact paths for screenshots, traces, and summaries
- Tasks where Codex should analyze a page, capture evidence, and compare runs

## What The Skill Does

- Captures a single run with:
  - full-page screenshot
  - interactive snapshot
  - Chrome trace profile
  - page metrics from the browser Performance API
  - console output and page errors
  - normalized `summary.json` and `summary.md`
- Stores each run under a predictable artifact directory
- Compares either the latest two runs or any two explicit runs
- Keeps `summary.json` as the canonical machine-readable artifact

## When Not To Use

This skill is not a full performance platform. It is a repeatable capture-and-compare workflow.

Use something else when you need:

- Lighthouse or PageSpeed-style scoring
- Real-user monitoring data
- Multi-region, multi-device, or load-testing infrastructure
- Long-running dashboards instead of point-in-time capture artifacts

## Requirements

- `agent-browser` available on `PATH`
- `bash`
- `node`
- A writable artifact directory
- Approval for elevated execution in restricted sandboxes when `agent-browser` requires it

The default artifact root is:

```text
$PWD/.codex/artifacts/agent-browser-performance/
```

In normal use, `$PWD` should be the project being analyzed, not this skill repository.

## Folder Structure

```text
agent-browser-performance/
├── SKILL.md
├── README.md
├── agents/
│   └── openai.yaml
├── references/
│   ├── guide-zh.md
│   └── output-layout.md
└── scripts/
    ├── capture-performance.sh
    ├── compare-latest.sh
    ├── compare-runs.js
    ├── page-metrics.js
    ├── summarize-run.js
    └── url-slug.js
```

## Core Scripts

### `scripts/capture-performance.sh`

Captures one run for one URL and writes a complete artifact set into a timestamped directory.

Positional arguments:

```text
capture-performance.sh <url> [label] [output-root]
```

Common labels:

- `baseline`
- `after-fix`
- `after-build`
- `checkout`
- `mobile-nav`

### `scripts/compare-latest.sh`

Finds the newest two runs for the same site and writes comparison artifacts.

It accepts any of:

- a URL
- a site slug
- a site artifact directory

### `scripts/compare-runs.js`

Compares two explicit run directories or two explicit `summary.json` files.

Use `--output-dir <dir>` when you want the comparison written to disk instead of printed to stdout.

## Usage

Typical requests that should trigger this skill:

- Analyze why this page feels slow
- Capture a performance baseline for this URL
- Compare page-load performance before and after a change
- Collect screenshots, profiles, and summaries into fixed artifact paths

## Quick Start

Capture a baseline:

```bash
bash scripts/capture-performance.sh \
  "https://example.com" \
  baseline
```

Compare the newest two runs for the same page:

```bash
bash scripts/compare-latest.sh \
  "https://example.com"
```

Compare two explicit runs:

```bash
node scripts/compare-runs.js \
  .codex/artifacts/agent-browser-performance/example.com-root/20260311-140000-baseline \
  .codex/artifacts/agent-browser-performance/example.com-root/20260311-143000-after-fix
```

## Common Capture Options

`capture-performance.sh` supports these high-value options:

- `--profile <path>`: reuse a persistent browser profile
- `--state <path>`: load a storage state JSON file before navigation
- `--session-name <name>`: reuse saved `agent-browser` session state
- `--headed`: show the browser window
- `--manual`: pause after open so a human can finish login or CAPTCHA
- `--ready-selector <sel>`: wait for a selector before capture
- `--ready-text <text>`: wait for page text before capture
- `--ready-url <pattern>`: wait for a URL pattern before capture
- `--load-state <state>`: one of `load`, `domcontentloaded`, `networkidle`, or `none`
- `--settle-ms <ms>`: extra wait after the page is considered ready

Use at most one of `--ready-selector`, `--ready-text`, or `--ready-url` in the same run.

## Recommended Workflow

1. Capture a clean baseline before a meaningful frontend change.
2. Make the change.
3. Capture a second run with a stable label such as `after-fix`.
4. Compare either the latest two runs or the exact pair you care about.
5. Read `summary.md` for a quick human pass and `summary.json` for machine-readable detail.
6. Open `profile.json` in DevTools or Perfetto only when the summaries suggest deeper main-thread or trace analysis is needed.

## Login And CAPTCHA Flows

For protected pages, do one interactive seeded run with a persistent profile:

```bash
bash scripts/capture-performance.sh \
  "https://example.com/dashboard" \
  baseline \
  --profile /tmp/example-profile \
  --manual \
  --ready-url "**/dashboard" \
  --load-state load \
  --settle-ms 2000
```

Use `--manual` when a human must finish login, MFA, or CAPTCHA before capture continues. `--manual` also implies `--headed`.

If the page keeps polling and `networkidle` is too strict, prefer `--load-state load` or `--load-state none` together with one of:

- `--ready-selector`
- `--ready-text`
- `--ready-url`

## Artifact Layout

Each capture is stored under:

```text
<artifact-root>/<site-slug>/<timestamp>-<label>/
```

Example:

```text
.codex/artifacts/agent-browser-performance/example.com-root/20260311-142530-baseline/
```

Files produced per run:

- `request.json`
- `title.txt`
- `final-url.txt`
- `full.png`
- `interactive-snapshot.txt`
- `profile.json`
- `page-metrics.raw.json`
- `page-metrics.json`
- `console.raw.json`
- `console.json`
- `errors.raw.json`
- `errors.json`
- `summary.json`
- `summary.md`

Comparison output is written under:

```text
<artifact-root>/<site-slug>/comparisons/<run-a>__vs__<run-b>/
```

Files produced per comparison:

- `comparison.json`
- `comparison.md`

## Reading Results

Start with these files:

- `summary.md`: fastest human-readable overview for one run
- `summary.json`: canonical structured data for automation and comparisons
- `comparison.md`: fastest human-readable diff between two runs
- `comparison.json`: normalized deltas for scripts or later tooling

Use these files when you need deeper inspection:

- `profile.json`: Chrome trace-event profile for DevTools Performance, Perfetto, or `chrome://tracing`
- `full.png`: confirms the rendered page state
- `interactive-snapshot.txt`: useful when verifying that the page actually reached the expected interactive structure
- `console.json` and `errors.json`: fast sanity check for noisy pages or failed app boot

Common comparison metrics include:

- `Response end`
- `DOMContentLoaded`
- `Load event`
- `First paint`
- `First contentful paint`
- `Total transfer`
- `Resource count`
- `Render-blocking resources`
- `Console messages`
- `Page errors`
- `Long tasks >=50ms`
- `Max RunTask`

## Operational Conventions

- Prefer stable labels so history stays readable across repeated work.
- Start a fresh capture after meaningful UI or bundle changes instead of comparing against stale runs from unrelated page states.
- For pages with polling, sockets, or long-lived network traffic, `networkidle` is often the wrong wait condition.
- Treat `summary.json` as the source of truth if other tooling needs to consume results.
- In real project repositories, the generated artifact root usually belongs in `.gitignore`.

## Notes

- `SKILL.md` is the machine-facing workflow. This README is the repository-facing overview.
- Prefer the scripts in `scripts/` over reconstructing long `agent-browser` command chains by hand.
- Read [references/guide-zh.md](./references/guide-zh.md) for a detailed Chinese walkthrough and metric interpretation.
- Read [references/output-layout.md](./references/output-layout.md) for the canonical artifact layout.
