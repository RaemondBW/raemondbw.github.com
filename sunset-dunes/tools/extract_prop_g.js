// Run in a browser tab on https://www.sfelections.org/results/20261103w/detail.html
// (plain curl/script downloads from sfelections are refused, so this runs inside the page).
//
// Finds the newest report that has a Statement of the Vote (sov.xlsx), parses the
// Measure G sheet with SheetJS, and returns JSON for tools/update_results.py:
//   { report, asOf, sovUrl, total: {reg, yes, no}, rows: "pct,reg,yes,no\n..." }
// Paste the returned JSON into a file and run:
//   python3 tools/update_results.py extracted.json
(async () => {
  const MEASURE = /^Measure G\b/i;

  const detail = new DOMParser().parseFromString(
    await (await fetch("/results/20261103w/detail.html", { cache: "no-store" })).text(),
    "text/html"
  );
  const asOf = (detail.body.textContent.match(/Last Update:\s*([^\n]+?)\s{2,}/) || [])[1] || "";

  // Each report is a panel whose first <h2> names it; the newest is first on the page.
  let report = null, sovUrl = null;
  for (const h2 of detail.querySelectorAll("h2")) {
    const panel = h2.closest(".panel") || h2.parentElement;
    const link = [...panel.querySelectorAll("a")].find(
      (a) => /\/sov\.xlsx$/.test(a.getAttribute("href") || "")
    );
    if (link) {
      report = h2.textContent.trim();
      sovUrl = new URL(link.getAttribute("href"), location.href).href;
      break;
    }
  }
  if (!sovUrl) throw new Error("No Statement of the Vote found on the detail page");

  const XLSX = window.XLSX || (await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"));
  window.XLSX = XLSX;
  const buf = await (await fetch(sovUrl, { cache: "no-store" })).arrayBuffer();
  // Only parse the sheet we need; parsing the whole 8 MB workbook is slow.
  const wbIndex = XLSX.read(buf, { bookSheets: true });
  let rowsOut = [], total = null;
  for (const name of wbIndex.SheetNames) {
    const wb = XLSX.read(buf, { sheets: name });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    if (!rows.slice(0, 4).some((r) => r && typeof r[0] === "string" && MEASURE.test(r[0].trim()))) continue;
    let cur = null;
    for (const r of rows) {
      if (typeof r[0] === "string" && r[0].startsWith("PCT ")) cur = r[0].slice(4).replace(" MB", "").trim();
      else if (r[0] === "Total" && cur) { rowsOut.push([cur, r[1], r[6], r[8]].join(",")); cur = null; }
      else if (r[0] === "Countywide - Total") total = { reg: r[1], yes: r[6], no: r[8] };
    }
    break;
  }
  if (!rowsOut.length) throw new Error("Measure G sheet not found in " + sovUrl);
  return JSON.stringify({ report, asOf, sovUrl, total, rows: "pct,reg,yes,no\n" + rowsOut.join("\n") });
})();
