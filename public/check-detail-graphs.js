import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

(() => {
  const state = new WeakMap();
  const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formatDateTime = (iso) => dateTimeFormatter.format(new Date(iso));

  const formatTimingMs = (value) => {
    if (value === null || value === undefined) return "-";
    return `${Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "")}ms`;
  };

  const metricLabel = (metric) => (metric === "latency" ? "latency" : "runtime");

  const getMetricValue = (point, metric) => (metric === "latency" ? point.latencyMs : point.runtimeMs);

  const buildMovingAveragePoints = (points, metric, windowSize = 5) => {
    const series = [];
    const numericValues = [];

    points.forEach((point) => {
      const value = getMetricValue(point, metric);
      if (typeof value !== "number") return;

      numericValues.push(value);
      const start = Math.max(0, numericValues.length - windowSize);
      const windowValues = numericValues.slice(start);
      const average = windowValues.reduce((sum, item) => sum + item, 0) / windowValues.length;

      series.push({
        checkedAt: point.checkedAt,
        value: average,
      });
    });

    return series;
  };

  const buildTooltipHtml = (point, metric) => {
    const status = point.state === "fail" ? "FAIL" : "OK";
    const selectedValue = formatTimingMs(getMetricValue(point, metric));
    const values = [
      ["status", status],
      ["latency", formatTimingMs(point.latencyMs)],
      ["runtime", formatTimingMs(point.runtimeMs)],
      [metricLabel(metric), selectedValue],
      ["http", point.statusCode === null ? "-" : String(point.statusCode)],
      ["error", point.error || "-"],
      ["server-timing", point.serverTimingSummary || "-"],
    ];

    return `
      <div class="graph-tooltip-title">
        <span>${formatDateTime(point.checkedAt)}</span>
        <span>${status}</span>
      </div>
      ${values
        .map(
          ([label, value]) => `
            <div class="graph-tooltip-row">
              <span class="graph-tooltip-key">${label}</span>
              <span class="graph-tooltip-value">${value}</span>
            </div>
          `,
        )
        .join("")}
    `;
  };

  const positionTooltip = (tooltip, hostRect, x, y) => {
    const preferredLeft = x + 14;
    const preferredTop = y - 18;
    const left = Math.max(8, Math.min(preferredLeft, hostRect.width - 280));
    const top = Math.max(8, preferredTop);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const parsePoints = (host) => {
    try {
      return JSON.parse(host.dataset.points || "[]");
    } catch {
      return [];
    }
  };

  const drawGraph = (host, frame, tooltip) => {
    const metric = host.dataset.metric === "runtime" ? "runtime" : "latency";
    const points = parsePoints(host);
    const numericPoints = points.filter((point) => typeof getMetricValue(point, metric) === "number");
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const width = Math.max(320, Math.floor(frame.getBoundingClientRect().width));
    const height = 288;
    const margin = { top: 18, right: 18, bottom: 44, left: 54 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const values = numericPoints.map((point) => getMetricValue(point, metric));
    const movingAveragePoints = buildMovingAveragePoints(points, metric);
    const movingAverageValues = movingAveragePoints.map((point) => point.value);
    const maxValue = Math.max(1, d3.max(values) ?? 1);
    const smoothMaxValue = d3.max(movingAverageValues) ?? 1;

    const xDomain = [dayAgo, now];

    const x = d3.scaleTime().domain(xDomain).range([margin.left, margin.left + innerWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(maxValue, smoothMaxValue) * 1.12])
      .nice()
      .range([margin.top + innerHeight, margin.top]);
    const line = d3
      .line()
      .defined((point) => typeof getMetricValue(point, metric) === "number")
      .x((point) => x(new Date(point.checkedAt)))
      .y((point) => y(getMetricValue(point, metric)))
      .curve(d3.curveMonotoneX);
    const smoothLine = d3
      .line()
      .defined((point) => typeof point.value === "number")
      .x((point) => x(new Date(point.checkedAt)))
      .y((point) => y(point.value))
      .curve(d3.curveMonotoneX);

    frame.replaceChildren();

    const svg = d3
      .select(frame)
      .append("svg")
      .attr("class", "graph-svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    svg.append("rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("rx", 12).attr("fill", "rgba(8, 19, 38, 0.15)");

    svg
      .append("g")
      .attr("class", "graph-grid")
      .attr("transform", `translate(0, ${margin.top})`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").attr("stroke-dasharray", "3 4"));

    svg
      .append("g")
      .attr("class", "graph-axis")
      .attr("transform", `translate(0, ${margin.top + innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%H:%M")))
      .call((g) => g.select(".domain").attr("stroke", "rgba(148, 163, 184, 0.28)"))
      .call((g) => g.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", "11px"));

    svg
      .append("g")
      .attr("class", "graph-axis")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat((value) => `${Math.round(Number(value))}`))
      .call((g) => g.select(".domain").attr("stroke", "rgba(148, 163, 184, 0.28)"))
      .call((g) => g.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", "11px"));

    if (numericPoints.length > 0) {
      svg
        .append("path")
        .datum(numericPoints)
        .attr("class", "graph-series graph-series-raw")
        .attr("stroke", metric === "runtime" ? "rgba(52, 211, 153, 0.36)" : "rgba(56, 189, 248, 0.34)")
        .attr("d", line);
    }

    if (movingAveragePoints.length > 1) {
      const smoothStroke = metric === "runtime" ? "#86efac" : "#fde68a";
      const smoothGlow = metric === "runtime" ? "rgba(52, 211, 153, 0.55)" : "rgba(253, 224, 71, 0.55)";

      svg
        .append("path")
        .datum(movingAveragePoints)
        .attr("class", "graph-series graph-series-smooth")
        .attr("stroke", smoothStroke)
        .attr("filter", `drop-shadow(0 0 6px ${smoothGlow})`)
        .attr("stroke-width", 4.5)
        .attr("d", smoothLine);
    }

    const hoverLayer = svg.append("g").attr("class", "graph-hover-layer");
    const hostRect = frame.getBoundingClientRect();

    const showTooltip = (point, cx, cy) => {
      tooltip.innerHTML = buildTooltipHtml(point, metric);
      tooltip.hidden = false;
      tooltip.classList.add("is-visible");
      positionTooltip(tooltip, hostRect, cx, cy);
    };

    const hideTooltip = () => {
      tooltip.hidden = true;
      tooltip.classList.remove("is-visible");
    };

    points.forEach((point) => {
      const value = getMetricValue(point, metric);
      const cx = x(new Date(point.checkedAt));
      const cy = typeof value === "number" ? y(value) : margin.top + innerHeight - 6;
      const fail = point.state === "fail";

      if (fail && typeof value === "number") {
        hoverLayer
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 7)
          .attr("fill", "rgba(248, 113, 113, 0.16)")
          .attr("stroke", "rgba(248, 113, 113, 0.5)")
          .attr("stroke-width", 1);
      }

      if (typeof value === "number" || fail) {
        hoverLayer
          .append("circle")
          .attr("class", `graph-point ${fail ? "is-fail" : "is-ok"}`)
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", fail ? 4.4 : 3.2)
          .attr("stroke-width", 1.5);

        hoverLayer
          .append("circle")
          .attr("class", "graph-hit")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 14)
          .on("pointerenter", () => showTooltip(point, cx, cy))
          .on("pointermove", () => showTooltip(point, cx, cy))
          .on("pointerleave", hideTooltip);
      }
    });

    if (numericPoints.length === 0) {
      tooltip.hidden = true;
      tooltip.classList.remove("is-visible");
    }
  };

  const initGraph = (host) => {
    if (!(host instanceof HTMLElement)) return;
    if (state.has(host)) return;

    const frame = host.querySelector('[data-role="graph-frame"]');
    const tooltip = host.querySelector('[data-role="graph-tooltip"]');
    if (!(frame instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) return;

    const redraw = () => drawGraph(host, frame, tooltip);
    const observer = new ResizeObserver(() => redraw());
    observer.observe(frame);

    state.set(host, { observer, redraw });
    host.dataset.graphInitialized = "true";
    redraw();
  };

  const initAllGraphs = () => {
    document.querySelectorAll("[data-check-graph]").forEach((host) => initGraph(host));
  };

  document.addEventListener("DOMContentLoaded", initAllGraphs);
  document.addEventListener("htmx:afterSwap", initAllGraphs);
})();
