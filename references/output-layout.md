# Output Layout

The default artifact root is:

```text
$PWD/.codex/artifacts/agent-browser-performance/
```

Each capture is stored under:

```text
<artifact-root>/<site-slug>/<timestamp>-<label>/
```

Example:

```text
.codex/artifacts/agent-browser-performance/example.com-root/20260311-142530-baseline/
```

Files produced per run:

- `request.json`: input URL, label, session id, run directory, and any profile/state/manual-wait options used for the run
- `title.txt`: page title from `agent-browser get title`
- `final-url.txt`: final URL after redirects
- `full.png`: full-page screenshot
- `interactive-snapshot.txt`: interactive element tree from `snapshot -i`
- `profile.json`: Chrome trace-event profile from `agent-browser profiler`
- `page-metrics.raw.json`: raw `agent-browser --json eval` envelope
- `page-metrics.json`: unwrapped page metrics
- `console.raw.json`: raw console envelope
- `console.json`: unwrapped console messages
- `errors.raw.json`: raw page error envelope
- `errors.json`: unwrapped page errors
- `summary.json`: normalized metrics for comparison
- `summary.md`: human-readable summary

Comparison output:

```text
<artifact-root>/<site-slug>/comparisons/<run-a>__vs__<run-b>/
```

Files produced per comparison:

- `comparison.json`: normalized delta values
- `comparison.md`: markdown comparison table
