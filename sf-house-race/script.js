/* global d3, topojson */

// ---------------------------------------------------------------------------
// Constants & state
// ---------------------------------------------------------------------------

const US_TOPOJSON =
  "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";

const FORMAT_AMOUNT = d3.format("$,.0f");
const FORMAT_DATE = d3.timeFormat("%b %e, %Y");
const PARSE_DATE = d3.timeParse("%Y-%m-%d");

const TRANSITION_MS = 1100;

// Must match the sizes used by precompute.mjs.
const CANONICAL_SIZES = [
  { label: "xs", width: 400, height: 620 },
  { label: "s", width: 900, height: 560 },
  { label: "m", width: 1280, height: 640 },
  { label: "l", width: 1600, height: 760 },
];

const state = {
  data: null,
  candidates: [],
  active: new Set(),
  geo: "all",
  minAmount: 0,
  includeSelf: false,
  view: "bubble",
  width: 0,
  height: 0,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  nodes: [],
  radius: null,
  stateFeatures: null,
  caCountyFeatures: null,
  sfZipFeatures: null,
  projection: null,
  quadtree: null,
  hoverId: -1,
  anim: null,
  timelineX: null,
  timelineY: null,
  size: null,      // chosen canonical size
  layouts: null,   // {width, height, bubble: {key: [...]} , map: {key: [...]}}
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const svg = d3.select("#chart");
const canvasEl = document.getElementById("dots");
const ctx = canvasEl.getContext("2d");
const tooltip = d3.select("#tooltip");
const loading = d3.select("#loading");

const mapLayer = svg.append("g").attr("class", "map");
const axisLayer = svg.append("g").attr("class", "axis timeline-axis");

state.size = pickCanonicalSize();

Promise.all([
  d3.json("data/donations.json"),
  d3.json(US_TOPOJSON),
  d3.json("data/ca-counties.json"),
  d3.json("data/sf-zips.json"),
  d3.json(`data/layouts-${state.size.label}.json`),
])
  .then(([data, us, caCounties, sfZips, layouts]) => {
    state.data = data;
    state.candidates = data.candidates;
    state.active = new Set(data.candidates.map((c) => c.id));
    state.stateFeatures = topojson.feature(us, us.objects.states).features;
    state.caCountyFeatures = caCounties.features;
    state.sfZipFeatures = sfZips.features;
    state.layouts = layouts;

    buildCandidateButtons();
    sizeChart();
    initNodes();
    applyLayouts();
    // Start dots at their current view's layout so the first frame isn't blank.
    state.nodes.forEach((n) => {
      const [x, y] = targetXY(n);
      n.x = x;
      n.y = y;
    });
    rebuildQuadtree();
    draw();

    loading.classed("hidden", true);

    window.addEventListener("resize", onResize);
    canvasEl.addEventListener("mousemove", onMouseMove);
    canvasEl.addEventListener("mouseleave", onMouseLeave);
  })
  .catch((err) => {
    loading.text("Failed to load data: " + err.message);
    console.error(err);
  });

// ---------------------------------------------------------------------------
// Canonical size selection
// ---------------------------------------------------------------------------

function pickCanonicalSize() {
  const w = window.innerWidth;
  if (w < 640) return CANONICAL_SIZES.find((s) => s.label === "xs");
  if (w < 1100) return CANONICAL_SIZES.find((s) => s.label === "s");
  if (w < 1450) return CANONICAL_SIZES.find((s) => s.label === "m");
  return CANONICAL_SIZES.find((s) => s.label === "l");
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function buildCandidateButtons() {
  const container = d3.select("#candidate-controls");
  container.selectAll("*").remove();
  container
    .selectAll("button")
    .data(state.candidates)
    .join("button")
    .attr("class", "candidate-btn")
    .style("color", (d) => d.color)
    .html(
      (d) =>
        `<span class="swatch"></span><span style="color:var(--text)">${d.name}</span>`
    )
    .on("click", function (_, d) {
      if (state.active.has(d.id)) {
        if (state.active.size === 1) return;
        state.active.delete(d.id);
      } else {
        state.active.add(d.id);
      }
      d3.select(this).classed("off", !state.active.has(d.id));
      onFilterChanged();
    });

  d3.selectAll(".view-btn").on("click", function () {
    const view = this.dataset.view;
    if (view === state.view) return;
    state.view = view;
    d3.selectAll(".view-btn").classed("active", false);
    d3.select(this).classed("active", true);
    onFilterChanged({ viewChanged: true });
  });

  d3.selectAll(".geo-btn").on("click", function () {
    const geo = this.dataset.geo;
    if (geo === state.geo) return;
    state.geo = geo;
    d3.selectAll(".geo-btn").classed("active", false);
    d3.select(this).classed("active", true);
    onFilterChanged({ geoChanged: true });
  });

  d3.selectAll(".amount-btn").on("click", function () {
    const min = Number(this.dataset.min);
    if (min === state.minAmount) return;
    state.minAmount = min;
    d3.selectAll(".amount-btn").classed("active", false);
    d3.select(this).classed("active", true);
    onFilterChanged({ geoChanged: true });
  });

  d3.selectAll(".self-btn").on("click", function () {
    const include = this.dataset.self === "include";
    if (include === state.includeSelf) return;
    state.includeSelf = include;
    d3.selectAll(".self-btn").classed("active", false);
    d3.select(this).classed("active", true);
    onFilterChanged();
  });
}

function rebuildRadii() {
  const records = state.data.records;
  // Scale is fixed to the max non-self amount, so toggling self on/off
  // doesn't shrink the regular dots. Self dots extrapolate past the domain
  // via the sqrt scale with no clamp, giving them much larger radii.
  const maxAmount = d3.max(
    records.filter((r) => !r.self),
    (r) => r.a
  );
  const range = (state.layouts && state.layouts.radiusRange) || [1.5, 10];
  state.radius = d3
    .scaleSqrt()
    .domain([1, maxAmount || 1])
    .range(range)
    .clamp(false);
  for (const n of state.nodes) n.r = state.radius(n.record.a);
}

function onFilterChanged({ geoChanged = false } = {}) {
  applyLayouts();
  if (geoChanged) {
    rebuildProjection();
    if (state.view === "map") redrawMap();
  }
  animateToTargets();
}

function isVisible(node) {
  if (!state.active.has(node.candidate)) return false;
  if (state.view === "map" && node.mapHidden) return false;
  const r = node.record;
  if (!state.includeSelf && r.self) return false;
  if (state.minAmount > 0 && r.a <= state.minAmount) return false;
  if (state.geo === "ca") return r.s === "CA";
  if (state.geo === "sf") {
    return r.s === "CA" && (r.z || "").startsWith("941");
  }
  if (state.geo === "notca") return r.s !== "CA";
  if (state.geo === "notsf") {
    return !(r.s === "CA" && (r.z || "").startsWith("941"));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

function sizeChart() {
  state.width = state.size.width;
  state.height = state.size.height;
  state.dpr = Math.max(1, window.devicePixelRatio || 1);

  canvasEl.width = state.width * state.dpr;
  canvasEl.height = state.height * state.dpr;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  svg.attr("viewBox", `0 0 ${state.width} ${state.height}`);

  fitContent();
  rebuildProjection();
}

function fitContent() {
  // The container fills whatever flex gives it. Size the canvas + SVG to
  // letterbox inside it, preserving the canonical aspect so positions don't
  // distort.
  const container = document.getElementById("chart-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (cw === 0 || ch === 0) return;
  const aspect = state.width / state.height;
  let w, h;
  if (cw / aspect <= ch) {
    w = cw;
    h = w / aspect;
  } else {
    h = ch;
    w = h * aspect;
  }
  const left = (cw - w) / 2;
  const top = (ch - h) / 2;
  canvasEl.style.width = w + "px";
  canvasEl.style.height = h + "px";
  canvasEl.style.left = left + "px";
  canvasEl.style.top = top + "px";
  const sel = svg.node().style;
  sel.width = w + "px";
  sel.height = h + "px";
  sel.left = left + "px";
  sel.top = top + "px";
}

function onResize() {
  const next = pickCanonicalSize();
  if (next.label === state.size.label) {
    // Same canonical size — no need to re-fetch. The canvas is CSS-scaled.
    return;
  }
  state.size = next;
  loading.classed("hidden", false).text("Loading layout…");
  d3.json(`data/layouts-${state.size.label}.json`).then((layouts) => {
    state.layouts = layouts;
    sizeChart();
    // Update radii scale to the new size's range, then recompute each node's
    // display radius.
    const range = layouts.radiusRange || [1.5, 10];
    state.radius = d3
      .scaleSqrt()
      .domain(state.radius.domain())
      .range(range)
      .clamp(true);
    for (const n of state.nodes) n.r = state.radius(n.record.a);
    computeTimelineLayout();
    applyLayouts();
    state.nodes.forEach((n) => {
      const [x, y] = targetXY(n);
      n.x = x;
      n.y = y;
    });
    rebuildQuadtree();
    if (state.view === "map") redrawMap();
    if (state.view === "timeline") redrawTimelineAxis();
    draw();
    loading.classed("hidden", true);
  });
}

function rebuildProjection() {
  const w = state.width;
  const h = state.height;
  const padded = [[20, 20], [w - 20, h - 20]];
  // "all", "notca", and "notsf" all show the full US map — the set of dots
  // differs but the projection and outlines are the same.
  if (state.geo === "all" || state.geo === "notca" || state.geo === "notsf") {
    state.projection = d3
      .geoAlbersUsa()
      .fitSize([w, h], {
        type: "FeatureCollection",
        features: state.stateFeatures,
      });
    return;
  }
  if (state.geo === "ca") {
    // Must match the server's fit geometry (ca-counties FeatureCollection)
    // exactly, or precomputed dot positions won't line up with the map paths.
    state.projection = d3.geoMercator().fitExtent(padded, {
      type: "FeatureCollection",
      features: state.caCountyFeatures,
    });
    return;
  }
  // sf
  const coords = state.data.records
    .filter((r) => (r.z || "").startsWith("941") && r.ll)
    .map((r) => r.ll);
  state.projection = d3.geoMercator().fitExtent(padded, {
    type: "MultiPoint",
    coordinates: coords,
  });
}

// ---------------------------------------------------------------------------
// Nodes & layouts
// ---------------------------------------------------------------------------

function initNodes() {
  const records = state.data.records;
  // Scale fixed to max non-self amount so regular dots stay the same size
  // regardless of the self-contribution toggle. Self dots extrapolate past
  // the domain (no clamp) and render much larger.
  const maxAmount = d3.max(
    records.filter((r) => !r.self),
    (r) => r.a
  );
  const range = (state.layouts && state.layouts.radiusRange) || [1.5, 10];
  state.radius = d3
    .scaleSqrt()
    .domain([1, maxAmount || 1])
    .range(range)
    .clamp(false);

  state.nodes = records.map((r, i) => ({
    id: i,
    record: r,
    candidate: r.c,
    r: state.radius(r.a),
    color: colorFor(r.c),
    x: state.width / 2,
    y: state.height / 2,
    bubbleX: state.width / 2,
    bubbleY: state.height / 2,
    mapX: -9999,
    mapY: -9999,
    mapHidden: true,
  }));

  computeTimelineLayout();
}

function colorFor(cid) {
  const c = state.candidates.find((x) => x.id === cid);
  return c ? c.color : "#999";
}

function layoutLookupKey() {
  const self = state.includeSelf ? "with" : "without";
  return `${[...state.active].sort().join(",")}|${state.geo}|${state.minAmount}|${self}`;
}

function applyLayouts() {
  const key = layoutLookupKey();
  const bubble = state.layouts.bubble[key];
  if (bubble) applyPositions("bubble", bubble);

  const map = state.layouts.map[key];
  applyPositions("map", map || []);
}

function applyPositions(mode, positions) {
  if (mode === "map") {
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      n.mapHidden = true;
      n.mapX = -9999;
      n.mapY = -9999;
    }
  }
  for (let i = 0; i < positions.length; i += 3) {
    const id = positions[i];
    const x = positions[i + 1];
    const y = positions[i + 2];
    const node = state.nodes[id];
    if (!node) continue;
    if (mode === "bubble") {
      node.bubbleX = x;
      node.bubbleY = y;
    } else {
      node.mapX = x;
      node.mapY = y;
      node.mapHidden = false;
    }
  }
}

function computeTimelineLayout() {
  const records = state.data.records;
  const dates = records.map((r) => PARSE_DATE(r.d));
  const narrow = state.width < 600;

  // Candidate labels sit above each row on every size so dots can't cover
  // them. Narrow canvases also rotate the date ticks and shrink margins.
  const leftMargin = narrow ? 14 : 24;
  const rightMargin = narrow ? 14 : 24;
  const topPad = narrow ? 26 : 32;
  const bottomPad = narrow ? 72 : 56;
  const paddingInner = narrow ? 0.38 : 0.24;

  const x = d3
    .scaleTime()
    .domain(d3.extent(dates))
    .range([leftMargin, state.width - rightMargin]);

  const cands = state.candidates;
  const yBand = d3
    .scaleBand()
    .domain(cands.map((c) => c.id))
    .range([topPad, state.height - bottomPad])
    .paddingInner(paddingInner);

  state.nodes.forEach((n, i) => {
    const d = PARSE_DATE(n.record.d);
    const band = yBand(n.candidate);
    const bandH = yBand.bandwidth();
    const jitter = ((i * 9301 + 49297) % 233280) / 233280;
    n.timelineX = x(d);
    n.timelineY = band + bandH * 0.5 + (jitter - 0.5) * bandH * 0.85;
  });

  state.timelineX = x;
  state.timelineY = yBand;
  state.timelineNarrow = narrow;
}

function targetXY(n) {
  switch (state.view) {
    case "timeline":
      return [n.timelineX, n.timelineY];
    case "map":
      return [n.mapX, n.mapY];
    default:
      return [n.bubbleX, n.bubbleY];
  }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

function animateToTargets() {
  const len = state.nodes.length;
  const fromX = new Float32Array(len);
  const fromY = new Float32Array(len);
  const toX = new Float32Array(len);
  const toY = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const n = state.nodes[i];
    fromX[i] = n.x;
    fromY[i] = n.y;
    const [tx, ty] = targetXY(n);
    toX[i] = tx;
    toY[i] = ty;
  }
  state.anim = { start: performance.now(), fromX, fromY, toX, toY };
  requestAnimationFrame(tick);
}

function tick(now) {
  const a = state.anim;
  if (!a) return;
  const t = Math.min(1, (now - a.start) / TRANSITION_MS);
  const e = easeInOutCubic(t);
  const nodes = state.nodes;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].x = a.fromX[i] + (a.toX[i] - a.fromX[i]) * e;
    nodes[i].y = a.fromY[i] + (a.toY[i] - a.fromY[i]) * e;
  }
  draw();
  if (t < 1) {
    requestAnimationFrame(tick);
  } else {
    state.anim = null;
    rebuildQuadtree();
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw() {
  const w = state.width;
  const h = state.height;
  ctx.clearRect(0, 0, w, h);

  // SVG chrome visibility
  mapLayer.attr("opacity", state.view === "map" ? 1 : 0);
  axisLayer.attr("opacity", state.view === "timeline" ? 1 : 0);
  if (state.view === "map") redrawMap();
  if (state.view === "timeline") redrawTimelineAxis();

  const nodes = state.nodes;
  ctx.globalAlpha = 0.7;
  const byColor = {};
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!isVisible(n)) continue;
    (byColor[n.color] ||= []).push(n);
  }
  for (const color in byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const list = byColor[color];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      ctx.moveTo(n.x + n.r, n.y);
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (state.hoverId >= 0) {
    const n = nodes[state.hoverId];
    if (isVisible(n)) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function redrawMap() {
  const path = d3.geoPath(state.projection);
  let features;
  let cls;
  if (state.geo === "sf") {
    features = state.sfZipFeatures;
    cls = "state zip";
  } else if (state.geo === "ca") {
    features = state.caCountyFeatures;
    cls = "state county";
  } else {
    features = state.stateFeatures;
    cls = "state";
  }
  mapLayer.selectAll("path.state").remove();
  mapLayer
    .selectAll("path.state")
    .data(features)
    .join("path")
    .attr("class", cls)
    .attr("d", path);
}

function redrawTimelineAxis() {
  axisLayer.selectAll("*").remove();
  const x = state.timelineX;
  const y = state.timelineY;
  const narrow = state.timelineNarrow;

  const axisY = narrow ? state.height - 58 : state.height - 40;
  const axisG = axisLayer
    .append("g")
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(x).ticks(narrow ? 7 : 8).tickSizeOuter(0));

  if (narrow) {
    axisG
      .selectAll("text")
      .attr("transform", "rotate(-38)")
      .attr("text-anchor", "end")
      .attr("dx", "-0.4em")
      .attr("dy", "0.3em");
  }

  const labels = axisLayer
    .append("g")
    .attr("class", "row-labels")
    .selectAll("text")
    .data(state.candidates)
    .join("text")
    .attr("fill", (c) => c.color)
    .attr("font-weight", 600)
    .text((c) => c.name);

  labels
    .attr("x", narrow ? 6 : 16)
    .attr("y", (c) => y(c.id) - 6)
    .attr("dominant-baseline", "alphabetic")
    .attr("font-size", narrow ? 11 : 13);
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

function rebuildQuadtree() {
  state.quadtree = d3
    .quadtree()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(state.nodes);
}

function onMouseMove(ev) {
  if (!state.quadtree) return;
  const rect = canvasEl.getBoundingClientRect();
  // Convert viewport px to canonical px (canvas may be CSS-scaled).
  const scaleX = state.width / rect.width;
  const scaleY = state.height / rect.height;
  const mx = (ev.clientX - rect.left) * scaleX;
  const my = (ev.clientY - rect.top) * scaleY;

  const found = findNearest(mx, my);
  if (found && isVisible(found)) {
    if (state.hoverId !== found.id) {
      state.hoverId = found.id;
      draw();
      showTooltip(found);
    }
    moveTooltip(ev.clientX - rect.left, ev.clientY - rect.top);
  } else if (state.hoverId !== -1) {
    state.hoverId = -1;
    draw();
    hideTooltip();
  }
}

function onMouseLeave() {
  if (state.hoverId !== -1) {
    state.hoverId = -1;
    draw();
  }
  hideTooltip();
}

function findNearest(mx, my) {
  const radius = 22;
  let best = null;
  let bestD = Infinity;
  state.quadtree.visit(function (node, x0, y0, x1, y1) {
    if (!node.length) {
      do {
        const d = node.data;
        if (!isVisible(d)) continue;
        const dx = d.x - mx;
        const dy = d.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= d.r + 1 && dist < bestD) {
          best = d;
          bestD = dist;
        }
      } while ((node = node.next));
    }
    return x0 > mx + radius || x1 < mx - radius || y0 > my + radius || y1 < my - radius;
  });
  return best;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function showTooltip(node) {
  const r = node.record;
  const cand = state.candidates.find((c) => c.id === r.c);
  const lines = [];
  lines.push(`<div class="name">${escapeHTML(r.n) || "Anonymous donor"}</div>`);
  lines.push(`<div class="amount">${FORMAT_AMOUNT(r.a)}</div>`);
  lines.push(`<div class="row">${FORMAT_DATE(PARSE_DATE(r.d))}</div>`);
  const place = [r.ct, r.s, r.z].filter(Boolean).join(", ");
  if (place) lines.push(`<div class="row">${escapeHTML(place)}</div>`);
  if (r.o || r.e) {
    const occ = [r.o, r.e].filter(Boolean).join(" · ");
    lines.push(`<div class="row">${escapeHTML(occ)}</div>`);
  }
  lines.push(
    `<div class="candidate-tag" style="background:${cand.color}">${escapeHTML(
      cand.name
    )}</div>`
  );
  tooltip
    .html(lines.join(""))
    .classed("hidden", false)
    .classed("above", true)
    .classed("below", false);
}

function moveTooltip(x, y) {
  const height = tooltip.node().offsetHeight || 0;
  const rect = canvasEl.getBoundingClientRect();
  const rightEdge = rect.width;
  const half = (tooltip.node().offsetWidth || 0) / 2;
  const clampedX = Math.max(half + 6, Math.min(rightEdge - half - 6, x));
  const above = y - height - 14 >= 6;
  tooltip
    .classed("above", above)
    .classed("below", !above)
    .style("left", clampedX + "px")
    .style("top", y + "px");
}

function hideTooltip() {
  tooltip.classed("hidden", true);
}

function escapeHTML(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
