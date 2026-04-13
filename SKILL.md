---
name: agent-browser-performance
description: Repeatable website performance analysis with agent-browser. Use when Codex needs to analyze page-load performance, capture browser profiling evidence, compare two runs, or standardize website performance artifacts across repeated checks. Triggers include requests such as "分析网站性能", "采集页面性能", "对比两次页面加载", "capture a performance baseline", "compare browser performance runs", or "collect performance artifacts for this URL".
---

# Agent Browser Performance

## Overview

Capture repeatable browser-performance evidence for a URL with fixed artifact paths and comparison-ready summaries. Use the bundled scripts instead of reconstructing long `agent-browser` command chains.

## Workflow

1. Run `scripts/capture-performance.sh` for a target URL.
   Use `--profile`, `--state`, `--session-name`, `--headed`, or `--manual` when login or CAPTCHA is involved.
2. Read `summary.md` and `summary.json` in the new run directory.
3. Run `scripts/compare-latest.sh` or `scripts/compare-runs.js` when two runs need comparison.

## Quick Start

Use the default artifact root unless the user explicitly asks for another location.

```bash
bash scripts/capture-performance.sh \
  "https://example.com" \
  baseline
```

For a login- or CAPTCHA-protected page, do one interactive seeded run with a persistent profile:

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

## Script Roles

### `scripts/capture-performance.sh`

Collect a single performance sample and write a fixed artifact set:

- full-page screenshot
- interactive snapshot
- page metrics from the browser Performance API
- console and page errors
- Chrome trace profile
- normalized summary files

Prefer a short label such as `baseline`, `after-fix`, `mobile-nav`, or `checkout`.
Use `--manual` with `--profile` or `--session-name` when a human must complete login or CAPTCHA before capture continues.

### `scripts/compare-latest.sh`

Resolve the site artifact directory and compare the newest two runs. Use this when the user asks for a quick regression check after a change.

### `scripts/compare-runs.js`

Compare two specific run directories or two `summary.json` files. Use this when the user names exact runs or when "latest two" is not the right pair.

## Operational Notes

- Start with a fresh capture after meaningful frontend changes. Do not compare stale runs across unrelated page states.
- Keep labels stable. Reuse labels like `baseline`, `after-build`, and `after-cache-fix` so the comparison history stays legible.
- For CAPTCHA or MFA pages, first run in `--headed --manual` mode with a persistent `--profile` or `--session-name`, then reuse the same state for later captures.
- If the app keeps polling and `networkidle` is too strict, use `--load-state load` or `--load-state none` together with `--ready-selector`, `--ready-text`, or `--ready-url`.
- Read [references/guide-zh.md](references/guide-zh.md) when the user wants a detailed Chinese walkthrough, metric interpretation, or examples of how to label and compare runs.
- Read [references/output-layout.md](references/output-layout.md) when the user asks where artifacts live or which files are safe to diff.
- Expect `agent-browser` to require elevated execution in restricted sandboxes. The scripts standardize the workflow; they do not bypass sandbox or approval rules.
- Treat `summary.json` as the canonical machine-readable file. Treat `summary.md` as the fast human-readable overview.
