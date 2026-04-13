(() => {
  const round = (value) =>
    typeof value === "number" && Number.isFinite(value)
      ? Number(value.toFixed(2))
      : null;

  const navigation = performance.getEntriesByType("navigation")[0] || null;
  const paintEntries = performance.getEntriesByType("paint");
  const paints = Object.fromEntries(
    paintEntries.map((entry) => [entry.name, round(entry.startTime)])
  );

  const resourceEntries = performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType || "other",
    durationMs: round(entry.duration),
    startTimeMs: round(entry.startTime),
    transferSize: entry.transferSize || 0,
    encodedBodySize: entry.encodedBodySize || 0,
    decodedBodySize: entry.decodedBodySize || 0,
    renderBlockingStatus: entry.renderBlockingStatus || "unknown",
    nextHopProtocol: entry.nextHopProtocol || null,
  }));

  const byInitiator = {};
  let transferSize = 0;
  let encodedBodySize = 0;
  let decodedBodySize = 0;
  let renderBlockingCount = 0;

  for (const entry of resourceEntries) {
    byInitiator[entry.initiatorType] = (byInitiator[entry.initiatorType] || 0) + 1;
    transferSize += entry.transferSize;
    encodedBodySize += entry.encodedBodySize;
    decodedBodySize += entry.decodedBodySize;
    if (entry.renderBlockingStatus === "blocking") {
      renderBlockingCount += 1;
    }
  }

  const topByTransfer = [...resourceEntries]
    .sort((left, right) => {
      if (right.transferSize !== left.transferSize) {
        return right.transferSize - left.transferSize;
      }
      return (right.durationMs || 0) - (left.durationMs || 0);
    })
    .slice(0, 10);

  const topByDuration = [...resourceEntries]
    .sort((left, right) => (right.durationMs || 0) - (left.durationMs || 0))
    .slice(0, 10);

  const memory =
    performance.memory &&
    typeof performance.memory.jsHeapSizeLimit === "number"
      ? {
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          usedJSHeapSize: performance.memory.usedJSHeapSize,
        }
      : null;

  const dom = {
    nodes: document.querySelectorAll("*").length,
    images: document.images.length,
    scripts: document.scripts.length,
    stylesheets: document.querySelectorAll('link[rel="stylesheet"], style').length,
    iframes: document.querySelectorAll("iframe").length,
  };

  const payload = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    timeOrigin: performance.timeOrigin,
    navigation: navigation
      ? {
          type: navigation.type,
          durationMs: round(navigation.duration),
          responseStartMs: round(navigation.responseStart),
          responseEndMs: round(navigation.responseEnd),
          domInteractiveMs: round(navigation.domInteractive),
          domContentLoadedMs: round(navigation.domContentLoadedEventEnd),
          loadEventMs: round(navigation.loadEventEnd),
          transferSize: navigation.transferSize || 0,
          encodedBodySize: navigation.encodedBodySize || 0,
          decodedBodySize: navigation.decodedBodySize || 0,
        }
      : null,
    paints,
    resources: {
      count: resourceEntries.length,
      byInitiator,
      transferSize,
      encodedBodySize,
      decodedBodySize,
      renderBlockingCount,
      topByTransfer,
      topByDuration,
    },
    dom,
    memory,
  };

  return JSON.stringify(payload);
})()
