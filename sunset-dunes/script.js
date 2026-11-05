// Sunset Dunes shift map: 2024 Prop K (Yes = create the park) vs 2026 Prop G (No = keep the park).

// Which 2026 report the data comes from; written by tools/update_results.py.
let REPORT = { report: "", asOf: "", final: false };
const MIN_VOTES = 25; // skip tiny mail-ballot-only precincts
const PARK = getComputedStyle(document.documentElement).getPropertyValue("--park").trim();
const CAR = getComputedStyle(document.documentElement).getPropertyValue("--car").trim();
const TILT = (22 * Math.PI) / 180; // arrows rise as they lengthen

// Neighborhood names to label on the map (must match the DataSF neigh22 field).
const MAP_LABELS = {
  "Sunset/Parkside": "Sunset", "Inner Sunset": "Inner Sunset", "Outer Richmond": "Outer Richmond",
  "Inner Richmond": "Inner Richmond", "Mission": "Mission", "Bayview Hunters Point": "Bayview",
  "Excelsior": "Excelsior", "Marina": "Marina", "South of Market": "SoMa",
  "Western Addition": "Western Addition", "Noe Valley": "Noe Valley", "Visitacion Valley": "Visitacion Valley",
  "Lakeshore": "Lakeshore", "Chinatown": "Chinatown", "Potrero Hill": "Potrero Hill",
  "West of Twin Peaks": "West of Twin Peaks", "Oceanview/Merced/Ingleside": "Ingleside",
  "Haight Ashbury": "Haight-Ashbury", "Pacific Heights": "Pacific Heights", "Bernal Heights": "Bernal Heights",
  "Mission Bay": "Mission Bay", "North Beach": "North Beach",
};

const fmtPct = d3.format(".1f");
const fmtSigned = (v) => (v > 0 ? "+" : v < 0 ? "\u2212" : "") + (v !== 0 && Math.abs(v) < 0.05 ? "<0.1" : fmtPct(Math.abs(v)));
const fmtInt = d3.format(",");

Promise.all([
  // Results change as ballots are counted, so always revalidate them.
  d3.csv("data/results.csv", { cache: "no-cache" }, d3.autoType),
  d3.json("data/precincts.json"),
  d3.json("data/meta.json", { cache: "no-cache" }),
]).then(([rows, geo, meta]) => {
  REPORT = { ...meta, final: /final|certif/i.test(meta.report) };
  // Drop the unnamed precincts: tiny water/island parcels with no voters.
  geo.features = geo.features.filter((f) => f.properties.nh);
  const byPct = new Map();
  for (const r of rows) {
    const v24 = r.kyes + r.kno;
    const v26 = r.gyes + r.gno;
    byPct.set(String(r.pct), {
      ...r,
      v24,
      v26,
      p24: v24 ? (100 * r.kyes) / v24 : NaN, // Yes on K = park
      p26: v26 ? (100 * r.gno) / v26 : NaN, // No on G = park
    });
  }
  for (const f of geo.features) {
    const r = byPct.get(String(f.properties.pct));
    f.properties.r = r;
    f.properties.ok = !!r && r.v24 >= MIN_VOTES && r.v26 >= MIN_VOTES;
    if (r) r.shift = r.p26 - r.p24;
  }

  document.getElementById("asof").textContent =
    `${REPORT.final ? "Final results" : "Preliminary results"} \u00b7 ${REPORT.report}, updated ${REPORT.asOf}`;
  document.getElementById("report").textContent = `${REPORT.report} (${REPORT.asOf})`;
  if (REPORT.final) document.getElementById("prelim-note").textContent = "";
  document.getElementById("minv").textContent = MIN_VOTES;

  drawTopline(rows, geo);
  drawLegend();
  const redrawMap = drawMap(geo);
  drawNeighborhoods(geo);

  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastW) < 20) return;
    lastW = window.innerWidth;
    redrawMap();
    drawNeighborhoods(geo);
  });
});

function drawTopline(rows, geo) {
  const sum = (k) => d3.sum(rows, (r) => r[k]);
  const k = { yes: sum("kyes"), no: sum("kno") };
  const g = { yes: sum("gyes"), no: sum("gno") };
  const kPark = (100 * k.yes) / (k.yes + k.no);
  const gPark = (100 * g.no) / (g.yes + g.no);

  const drawn = geo.features.filter((f) => f.properties.ok).map((f) => f.properties.r);
  const toward = drawn.filter((r) => r.shift > 0).length;

  document.getElementById("dek").innerHTML =
    `In 2024, ${fmtPct(kPark)} percent of voters approved Proposition K, closing the Upper Great Highway ` +
    `to cars and creating Sunset Dunes park. On Tuesday, ${fmtPct(gPark)} percent rejected Proposition G, ` +
    `which would have reopened it to cars on weekdays. Support for the park grew in ` +
    `<b>${fmtInt(toward)} of ${fmtInt(drawn.length)}</b> precincts.`;

  const races = [
    {
      title: "2024 · Proposition K",
      sub: "Close the Upper Great Highway to cars and create a park",
      park: { label: "Yes", n: k.yes }, car: { label: "No", n: k.no }, final: true,
    },
    {
      title: "2026 · Proposition G",
      sub: "Allow private vehicles on the Great Highway on weekdays",
      park: { label: "No", n: g.no }, car: { label: "Yes", n: g.yes }, final: REPORT.final,
    },
  ];
  const el = d3.select("#topline");
  el.selectAll("*").remove();
  for (const r of races) {
    const tot = r.park.n + r.car.n;
    const pp = (100 * r.park.n) / tot;
    const box = el.append("div").attr("class", "race");
    box.append("h3").text(r.title);
    box.append("p").attr("class", "sub").text(r.sub);
    const bar = box.append("div").attr("class", "bar");
    bar.append("div").style("width", pp + "%").style("background", PARK);
    bar.append("div").style("width", 100 - pp + "%").style("background", CAR);
    const lab = box.append("div").attr("class", "bar-labels");
    lab.append("span").html(`<b style="color:${PARK}">${r.park.label} ${fmtPct(pp)}%</b> keep the park`);
    lab.append("span").html(`cars <b style="color:${CAR}">${r.car.label} ${fmtPct(100 - pp)}%</b>`);
    box.append("p").attr("class", "sub").style("margin", "6px 0 0")
      .text(`${fmtInt(tot)} votes${r.final ? ", certified" : " counted so far"}`);
  }
}

// Arrow geometry shared by the map and the legend.
function arrowPath(x0, y0, len) {
  const dir = Math.sign(len) || 1;
  const L = Math.abs(len);
  const x1 = x0 + dir * L * Math.cos(TILT);
  const y1 = y0 - L * Math.sin(TILT);
  // Control point keeps the start flat, so the arrow bends upward like NYT shift maps.
  const cx = x0 + dir * L * 0.55;
  const cy = y0;
  return { d: `M${x0},${y0}Q${cx},${cy} ${x1},${y1}`, x1, y1, cx, cy };
}

function headPath(a, size) {
  const ang = Math.atan2(a.y1 - a.cy, a.x1 - a.cx);
  const s = size;
  const p1 = [a.x1 + Math.cos(ang) * s * 0.6, a.y1 + Math.sin(ang) * s * 0.6];
  const p2 = [a.x1 + Math.cos(ang + 2.5) * s, a.y1 + Math.sin(ang + 2.5) * s];
  const p3 = [a.x1 + Math.cos(ang - 2.5) * s, a.y1 + Math.sin(ang - 2.5) * s];
  return `M${p1}L${p2}L${p3}Z`;
}

const headSizeFor = (width) => 1.5 + width * 1.1;

function drawArrow(g, x, y, len, color, width, headSize = headSizeFor(width)) {
  const a = arrowPath(x, y, len);
  g.append("path").attr("class", "arrow").attr("d", a.d)
    .attr("stroke", color).attr("stroke-width", width);
  g.append("path").attr("class", "arrow-head").attr("d", headPath(a, headSize))
    .attr("fill", color);
}

function drawLegend() {
  const el = d3.select("#legend");
  el.selectAll("*").remove();
  const items = [
    { len: 34, color: PARK, text: "More support for the park" },
    { len: -34, color: CAR, text: "Less support for the park" },
  ];
  for (const it of items) {
    const row = el.append("div").attr("class", "item");
    const svg = row.append("svg").attr("width", 40).attr("height", 22);
    drawArrow(svg.append("g"), it.len > 0 ? 4 : 36, 17, it.len, it.color, 1.6);
    row.append("span").style("color", it.color).style("font-weight", 600).text(it.text);
  }
}

function drawMap(geo) {
  const svg = d3.select("#map");
  const tooltip = d3.select("#tooltip");
  const wrap = document.getElementById("map-wrap");

  // Fit to the mainland + Treasure Island; ignore the Farallones if present.
  const mainland = {
    type: "FeatureCollection",
    features: geo.features.filter((f) => d3.geoCentroid(f)[0] > -122.6),
  };

  // Filter buttons: all arrows, only toward the park, or only away from it.
  let filter = "all";
  const drawn = geo.features.filter((f) => f.properties.ok).map((f) => f.properties.r);
  const counts = {
    all: drawn.length,
    toward: drawn.filter((r) => r.shift >= 0).length,
    away: drawn.filter((r) => r.shift < 0).length,
  };
  const buttons = [
    { key: "all", text: `All precincts (${counts.all})` },
    { key: "toward", text: `Toward the park (${counts.toward})`, color: PARK },
    { key: "away", text: `Away from the park (${counts.away})`, color: CAR },
  ];
  d3.select("#filter").selectAll("button").data(buttons).join("button")
    .attr("type", "button")
    .style("--c", (d) => d.color || "var(--ink)")
    .text((d) => d.text)
    .on("click", (event, d) => { filter = d.key; applyFilter(); });

  function applyFilter() {
    d3.select("#filter").selectAll("button").classed("active", (d) => d.key === filter);
    svg.selectAll(".arrow-g").attr("opacity", function () {
      if (filter === "all") return 0.92;
      return this.classList.contains(filter) ? 1 : 0.07;
    });
  }

  // Zoom: precinct shapes scale with the map; arrows and labels keep their
  // on-screen size and just move, so zooming in spreads crowded arrows apart.
  let zoomT = d3.zoomIdentity;
  const zoom = d3.zoom().scaleExtent([1, 10]);
  const zoomCtl = d3.select(wrap).append("div").attr("class", "zoom-ctl");
  zoomCtl.selectAll("button")
    .data([{ t: "+", k: 1.8, label: "Zoom in" }, { t: "−", k: 1 / 1.8, label: "Zoom out" }, { t: "↺", k: 0, label: "Reset zoom" }])
    .join("button").attr("type", "button").attr("aria-label", (d) => d.label).attr("title", (d) => d.label)
    .text((d) => d.t)
    .on("click", (e, d) => {
      const tr = svg.transition().duration(350);
      if (d.k) zoom.scaleBy(tr, d.k);
      else zoom.transform(tr, d3.zoomIdentity);
    });

  function render() {
    const W = wrap.clientWidth;
    if (!W) return; // not laid out yet (e.g. hidden tab); resize will redraw
    const H = Math.round(W * 0.78);
    svg.attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();
    zoomT = d3.zoomIdentity;
    svg.property("__zoom", d3.zoomIdentity);

    const pad = W < 600 ? 10 : 30;
    const proj = d3.geoMercator().fitExtent([[pad, pad + 20], [W - pad, H - pad]], mainland);
    const path = d3.geoPath(proj);
    const pxPerPt = Math.max(0.95, W / 400); // arrow length per percentage point
    const strokeW = W < 600 ? 1.1 : 1.5;

    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "transparent");

    const pg = svg.append("g");
    pg.selectAll("path")
      .data(geo.features)
      .join("path")
      .attr("class", (d) => "precinct" + (d.properties.ok ? "" : " nodata"))
      .attr("d", path)
      .on("mousemove", function (event, d) {
        d3.selectAll(".precinct.hover").classed("hover", false);
        d3.select(this).classed("hover", true);
        showTip(event, d);
      })
      .on("mouseleave", function () {
        d3.select(this).classed("hover", false);
        tooltip.classed("hidden", true);
      });

    // Leftward (away-from-park) arrows are few and short, so draw them last, on top
    // of the green ones; within each group, short arrows go under long ones.
    const arrows = geo.features
      .filter((f) => f.properties.ok)
      .map((f) => ({ f, c: path.centroid(f), s: f.properties.r.shift }))
      .filter((a) => isFinite(a.c[0]))
      .sort((a, b) => (a.s < 0) - (b.s < 0) || Math.abs(a.s) - Math.abs(b.s));
    const minLen = 5; // keep tiny shifts visible as a direction
    const ag = svg.append("g").attr("class", "arrows");
    const arrowGs = ag.selectAll("g").data(arrows).join("g")
      .attr("class", (a) => "arrow-g " + (a.s >= 0 ? "toward" : "away"))
      .each(function (a) {
        const g = d3.select(this);
        const len = Math.sign(a.s) * Math.max(Math.abs(a.s) * pxPerPt, minLen);
        if (a.s < 0) {
          // White halo so orange arrows stand out against neighboring green ones.
          drawArrow(g, 0, 0, len, "#fff", strokeW + 2.5, headSizeFor(strokeW + 0.4) + 1.5);
        }
        drawArrow(g, 0, 0, len, a.s >= 0 ? PARK : CAR, a.s < 0 ? strokeW + 0.4 : strokeW);
      });
    applyFilter();

    // Neighborhood labels at the mean centroid of their precincts.
    const groups = d3.group(geo.features, (f) => f.properties.nh);
    const labels = Object.keys(MAP_LABELS).filter((n) => groups.has(n)).map((n) => {
      const cs = groups.get(n).map((f) => path.centroid(f));
      return { n: MAP_LABELS[n], c: [d3.mean(cs, (c) => c[0]), d3.mean(cs, (c) => c[1])] };
    });
    const labelTs = svg.append("g").selectAll("text").data(labels).join("text")
      .attr("class", "map-label").attr("text-anchor", "middle").attr("dy", 16).text((d) => d.n);

    // Scale bar for arrows: 10 points (arrows don't scale with zoom, so it stays valid).
    const sb = svg.append("g").attr("transform", `translate(${W - pad - 10 * pxPerPt - 4},${pad + 4})`);
    sb.append("rect").attr("x", -6).attr("y", -2).attr("width", 10 * pxPerPt + 12).attr("height", 38)
      .attr("fill", "#fff").attr("opacity", 0.85);
    drawArrow(sb, 0, 14, 10 * pxPerPt, "#888", strokeW);
    sb.append("text").attr("x", 10 * pxPerPt * Math.cos(TILT)).attr("y", 30)
      .attr("text-anchor", "end").attr("font-size", 11).attr("fill", "#666")
      .text("10-pt. shift");

    function place() {
      const t = zoomT;
      pg.attr("transform", t);
      arrowGs.attr("transform", (a) => `translate(${t.apply(a.c)})`);
      labelTs.attr("transform", (d) => `translate(${t.apply(d.c)})`)
        .attr("display", W >= 480 || t.k >= 2 ? null : "none");
      zoomCtl.classed("zoomed", t.k > 1.01);
      // Let one-finger swipes scroll the page until the map is zoomed in.
      svg.style("touch-action", t.k > 1.01 ? "none" : "pan-x pan-y");
    }

    zoom
      .extent([[0, 0], [W, H]])
      .translateExtent([[0, 0], [W, H]])
      // Wheel zooms only with Ctrl/Cmd (or a trackpad pinch) so the page still scrolls;
      // on touch, pinch always zooms and one finger pans only once zoomed in.
      .filter((event) => {
        if (event.type === "wheel") return event.ctrlKey || event.metaKey;
        if (event.type === "touchstart") return event.touches.length > 1 || zoomT.k > 1.01;
        return !event.button;
      })
      .on("zoom", (event) => {
        zoomT = event.transform;
        tooltip.classed("hidden", true);
        place();
      });
    svg.call(zoom).on("dblclick.zoom", null);
    place();
  }

  function showTip(event, f) {
    const r = f.properties.r;
    const [mx, my] = d3.pointer(event, wrap);
    let html = `<div class="t-title">${f.properties.nh}</div><div class="t-sub">Precinct ${f.properties.pct}</div>`;
    if (!r || !f.properties.ok) {
      html += `<div>Too few votes to compare.</div>`;
    } else {
      const col = r.shift >= 0 ? PARK : CAR;
      html += `<table>
        <tr><td>2024: Yes on K</td><td class="num">${fmtPct(r.p24)}%</td></tr>
        <tr><td>2026: No on G</td><td class="num">${fmtPct(r.p26)}%</td></tr>
        <tr><td>Shift toward park</td><td class="num shift" style="color:${col}">${fmtSigned(r.shift)} pts</td></tr>
        <tr><td style="color:#888">Votes, 2024 / 2026</td><td class="num" style="color:#888">${fmtInt(r.v24)} / ${fmtInt(r.v26)}</td></tr>
      </table>`;
    }
    tooltip.html(html).classed("hidden", false);
    const tw = tooltip.node().offsetWidth;
    const th = tooltip.node().offsetHeight;
    const x = Math.max(0, Math.min(wrap.clientWidth - tw, mx + 14 + tw > wrap.clientWidth ? mx - tw - 14 : mx + 14));
    const y = Math.max(0, my - th - 10);
    tooltip.style("left", x + "px").style("top", y + "px");
  }

  render();
  return render;
}

let nhMode = "nh"; // "nh" = by neighborhood, "pct" = by precinct

function drawNeighborhoods(geo) {
  const el = d3.select("#nh-chart");
  el.selectAll("*").remove();

  const ok = geo.features.filter((f) => f.properties.ok);
  const nhData = d3.rollups(ok, (fs) => {
    const s = (k) => d3.sum(fs, (f) => f.properties.r[k]);
    const p24 = (100 * s("kyes")) / (s("kyes") + s("kno"));
    const p26 = (100 * s("gno")) / (s("gyes") + s("gno"));
    const away = fs.filter((f) => f.properties.r.shift < 0).length;
    return { p24, p26, shift: p26 - p24, n: fs.length, away };
  }, (f) => f.properties.nh)
    .map(([nh, v]) => ({ label: nh, nh, ...v }))
    .sort((a, b) => b.shift - a.shift);
  // Precinct view: biggest moves away from the park first.
  const pctData = ok
    .map((f) => ({ label: f.properties.nh, nh: f.properties.nh, pct: f.properties.pct, ...f.properties.r }))
    .sort((a, b) => a.shift - b.shift);

  const byPct = nhMode === "pct";
  const data = byPct ? pctData : nhData;
  const nAway = pctData.filter((d) => d.shift < 0).length;

  // Mode toggle + sort note.
  const ctl = el.append("div").attr("class", "filter");
  ctl.selectAll("button")
    .data([{ k: "nh", t: "By neighborhood" }, { k: "pct", t: "By precinct" }])
    .join("button").attr("type", "button").style("--c", "var(--ink)")
    .classed("active", (d) => d.k === nhMode).text((d) => d.t)
    .on("click", (e, d) => { nhMode = d.k; drawNeighborhoods(geo); });
  el.append("p").attr("class", "figure-note").style("margin", "8px auto 4px")
    .html(byPct
      ? `All ${pctData.length} precincts, sorted from the biggest move <b style="color:${CAR}">away from the park</b> (${nAway} precincts) to the biggest move toward it.`
      : `Sorted by the size of the shift. <span style="color:${CAR}">&darr;</span> = precincts in that neighborhood that moved away from the park.`);

  const W = el.node().clientWidth;
  const narrow = W < 560;
  const m = { top: narrow ? 46 : 28, right: narrow ? 66 : 92, bottom: 10, left: narrow ? 138 : 190 };
  const rowH = byPct ? 16 : 22;
  const H = m.top + m.bottom + rowH * data.length;
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);

  const lo = Math.floor(d3.min(data, (d) => Math.min(d.p24, d.p26)) / 10) * 10;
  const hi = Math.ceil(d3.max(data, (d) => Math.max(d.p24, d.p26)) / 10) * 10;
  const x = d3.scaleLinear().domain([lo, hi]).range([m.left, W - m.right]);
  const y = (i) => m.top + i * rowH + rowH / 2;

  const ticks = x.ticks(narrow ? 4 : 8);
  svg.append("g").selectAll("line").data(ticks).join("line")
    .attr("class", "gridline").attr("x1", x).attr("x2", x)
    .attr("y1", m.top - 6).attr("y2", H - m.bottom);
  svg.append("g").attr("class", "axis").selectAll("text").data(ticks).join("text")
    .attr("x", x).attr("y", m.top - 12).attr("text-anchor", "middle")
    .text((d, i) => (i === ticks.length - 1 && !narrow ? d + "% for park" : d + "%"));
  if (lo < 50 && hi > 50) {
    svg.append("line").attr("class", "mid-line")
      .attr("x1", x(50)).attr("x2", x(50)).attr("y1", m.top - 6).attr("y2", H - m.bottom);
  }
  // Divider between precincts that moved away and those that moved toward the park.
  if (byPct && nAway) {
    const yy = m.top + nAway * rowH;
    svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", yy).attr("y2", yy)
      .attr("stroke", CAR).attr("stroke-width", 1).attr("stroke-dasharray", "2 3");
  }

  const short = (n) => narrow
    ? n.replace("Oceanview/Merced/Ingleside", "Ingleside/Oceanview").replace("Financial District/South Beach", "FiDi/South Beach")
    : n;
  const row = svg.append("g").selectAll("g").data(data).join("g")
    .attr("transform", (d, i) => `translate(0,${y(i)})`);
  row.append("rect").attr("class", "row-hit")
    .attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH)
    .append("title")
    .text((d) => byPct
      ? `Precinct ${d.pct}, ${d.nh}: ${fmtPct(d.p24)}% (2024) → ${fmtPct(d.p26)}% (2026)`
      : `${d.nh}: ${fmtPct(d.p24)}% (2024) → ${fmtPct(d.p26)}% (2026), ${d.n} precincts, ${d.away} moved away`);
  const lab = row.append("text").attr("class", "nh-label")
    .style("font-size", byPct ? "11px" : narrow ? "11.5px" : null)
    .attr("x", m.left - 10).attr("dy", "0.35em").attr("text-anchor", "end");
  if (byPct) {
    lab.append("tspan").text((d) => short(d.nh) + " ");
    lab.append("tspan").attr("fill", "#999").text((d) => d.pct);
  } else {
    lab.text((d) => short(d.nh));
  }
  const r = byPct ? 2.6 : 3.5;
  const head = byPct ? 4.5 : 6;
  row.append("circle").attr("cx", (d) => x(d.p24)).attr("r", r)
    .attr("fill", "#fff").attr("stroke", "#999").attr("stroke-width", 1.2);
  row.each(function (d) {
    const g = d3.select(this);
    const col = d.shift >= 0 ? PARK : CAR;
    const x0 = x(d.p24), x1 = x(d.p26);
    const dir = Math.sign(x1 - x0) || 1;
    if (Math.abs(x1 - x0) > head) {
      g.append("line").attr("x1", x0 + dir * r).attr("x2", x1 - dir * head)
        .attr("stroke", col).attr("stroke-width", byPct ? 1.6 : 2);
    }
    g.append("path").attr("fill", col)
      .attr("d", `M${x1},0L${x1 - dir * head * 1.4},${-head * 0.75}L${x1 - dir * head * 1.4},${head * 0.75}Z`);
  });
  row.append("text").attr("class", "nh-val").attr("x", W - m.right + 8).attr("dy", "0.35em")
    .style("fill", (d) => (d.shift >= 0 ? PARK : CAR))
    .style("font-weight", 600)
    .text((d) => fmtSigned(d.shift));
  if (!byPct) {
    row.filter((d) => d.away > 0).append("text").attr("class", "nh-val")
      .attr("x", W - m.right + (narrow ? 40 : 46)).attr("dy", "0.35em")
      .style("fill", CAR).style("font-weight", 600)
      .text((d) => `${d.away}↓`);
  }

  // Key for the dot/arrow encoding.
  const key = svg.append("g").attr("transform", narrow ? `translate(${m.left},${m.top - 32})` : `translate(8,${m.top - 12})`);
  key.append("circle").attr("cx", 4).attr("cy", -4).attr("r", 3.5)
    .attr("fill", "#fff").attr("stroke", "#999").attr("stroke-width", 1.4);
  key.append("text").attr("x", 12).attr("y", 0).attr("font-size", 11).attr("fill", "#666").text("2024");
  key.append("path").attr("fill", PARK).attr("d", `M${narrow ? 62 : 70},-4l-8,-4.5v9Z`);
  key.append("text").attr("x", narrow ? 66 : 74).attr("y", 0).attr("font-size", 11).attr("fill", "#666").text("2026");
}
