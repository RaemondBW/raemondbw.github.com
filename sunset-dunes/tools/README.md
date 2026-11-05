# Updating the 2026 results

SF Elections posts updated preliminary results at about 4 p.m. PT each day through
Nov. 13, 2026 (except Nov. 11), then less often until certification (by Dec. 3).
Only the 2026 Prop G columns change; 2024 Prop K is final.

sfelections.org refuses plain script downloads, so the extraction runs in a browser tab.

1. Open https://www.sfelections.org/results/20261103w/detail.html in a browser.
2. Run `extract_prop_g.js` in that tab (DevTools console, or Claude's browser tool).
   It picks the newest report that has a Statement of the Vote (`sov.xlsx`), parses the
   Measure G sheet, and returns a JSON string.
3. Save that JSON to a file and merge it:

   ```bash
   python3 tools/update_results.py /path/to/extracted.json
   ```

   This rewrites `reg26,gyes,gno` in `data/results.csv` and `data/meta.json` (report name,
   time). It refuses to write unless all 514 precincts are present and the precinct sums
   equal the countywide totals. Prints `UNCHANGED` if nothing is new.
4. If it printed `UPDATED`, republish (the artifact and/or commit + push to GitHub Pages).

Note: not every report includes a Statement of the Vote. Some days only have the summary,
in which case the extractor returns the newest report that does.
