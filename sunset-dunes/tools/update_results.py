"""Merge freshly extracted 2026 Prop G precinct results into data/results.csv.

usage: python3 tools/update_results.py extracted.json

extracted.json is the output of tools/extract_prop_g.js. The script refuses to write
anything unless every precinct is present and the precinct sums equal the
countywide totals reported in the same Statement of the Vote.
Prints "UNCHANGED" if the data matches what is already on disk.
"""
import csv
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
RESULTS = os.path.join(DATA, "results.csv")
META = os.path.join(DATA, "meta.json")


def main(path):
    with open(path) as f:
        x = json.load(f)

    new = {}
    for r in csv.DictReader(io.StringIO(x["rows"])):
        new[r["pct"]] = (int(r["reg"]), int(r["yes"]), int(r["no"]))

    with open(RESULTS) as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())

    have = {r["pct"] for r in rows}
    if set(new) != have:
        sys.exit(f"Precinct mismatch: missing {sorted(have - set(new))}, extra {sorted(set(new) - have)}")

    t = x["total"]
    sy = sum(v[1] for v in new.values())
    sn = sum(v[2] for v in new.values())
    if (sy, sn) != (t["yes"], t["no"]):
        sys.exit(f"Totals don't match: precincts {sy}/{sn} vs countywide {t['yes']}/{t['no']}")

    changed = False
    for r in rows:
        reg, yes, no = new[r["pct"]]
        if (int(r["reg26"]), int(r["gyes"]), int(r["gno"])) != (reg, yes, no):
            changed = True
        r["reg26"], r["gyes"], r["gno"] = reg, yes, no

    meta = {"report": x["report"], "asOf": x["asOf"], "sovUrl": x["sovUrl"],
            "gyes": t["yes"], "gno": t["no"]}
    old_meta = json.load(open(META)) if os.path.exists(META) else None
    if not changed and old_meta == meta:
        print("UNCHANGED", x["report"])
        return

    with open(RESULTS, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    with open(META, "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    tot = sy + sn
    print(f"UPDATED {x['report']} ({x['asOf']}): Yes {sy:,} ({100*sy/tot:.1f}%), No {sn:,} ({100*sn/tot:.1f}%)")


if __name__ == "__main__":
    main(sys.argv[1])
