"""Canonical USD R7 from normalized SDK exports, with player-level uncertainty.
No network or dashboard credentials. Unknown impressions never become zero money.
"""
import csv
import math
import json
import random
import statistics
from collections import Counter
from datetime import datetime
from decimal import Decimal, getcontext
getcontext().prec = max(getcontext().prec, 80)
from pathlib import Path

DAY = 86400
SOURCE = "blocky_ilrd_v1"

def instant(value):
    if isinstance(value,str):
        parsed=datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None: raise ValueError("Use explicit UTC/offset timestamps")
        number=parsed.timestamp()
    else: number=float(value)
    if not math.isfinite(number) or number<0: raise ValueError("Invalid timestamp")
    return number

def calculate(data):
    as_of = instant(data["as_of"])
    assigned = {}
    experiments={a.get("experiment_id","blocky-composition-1") for a in data["assignments"] if a.get("mode")=="audience"}
    if len(experiments)>1: raise ValueError("Split experiment IDs before calculation")
    for a in data["assignments"]:
        if a.get("mode") != "audience" or a.get("test_mode", False):
            continue
        key = a["installation_id"]
        if key in assigned and assigned[key]["assignment_id"] != a["assignment_id"]:
            raise ValueError("Installation was reassigned: split experiments before calculation")
        if key in assigned and assigned[key]["variant"] != a["variant"]:
            raise ValueError("Conflicting variant")
        assigned.setdefault(key, a)
    impressions, revenues, events = {}, {}, {}
    for target, key, rows in [(impressions, "impression_id", data.get("impressions", [])), (revenues, "impression_id", data.get("revenue", [])), (events, "event_id", data.get("events", []))]:
        for row in rows:
            if row.get("test_mode", False) or row.get("mode", "audience") != "audience": continue
            identifier=row[key]
            if identifier in target:
                previous=target[identifier]
                if {k:v for k,v in previous.items() if k!="timestamp"}!={k:v for k,v in row.items() if k!="timestamp"}: raise ValueError("Conflicting duplicate: " + identifier)
                if instant(previous["timestamp"])<=instant(row["timestamp"]): continue
            target[identifier] = row
    players=[]
    for installation, a in assigned.items():
        start=instant(a["assigned_at"])
        income=Decimal(0); known=0; unknown=0
        observed=[e for e in impressions.values() if e["installation_id"]==installation and e.get("source")==SOURCE and start<=instant(e["timestamp"])<start+7*DAY]
        # The SDK revenue export is canonical. Diagnostic copies/automatic streams
        # are excluded even when they contain an amount.
        money=[r for r in revenues.values() if r["installation_id"]==installation and r.get("source")==SOURCE and start<=instant(r["timestamp"])<start+7*DAY]
        for r in money:
            if r["currency"]!="USD": raise ValueError("Canonical currency must be USD")
            amount=Decimal(r["amount"])
            if not amount.is_finite() or amount<0: raise ValueError("Invalid decimal revenue")
            income += amount; known += 1
        delivered={r["impression_id"] for r in money}
        unknown=sum(i["impression_id"] not in delivered for i in observed)
        session_times=[instant(e["timestamp"])-start for e in events.values() if e["installation_id"]==installation and e["name"] in ["session_started","app_foreground"]]
        players.append({"installation_id":installation,"assignment_id":a["assignment_id"],"variant":a["variant"],"cohort":a["cohort"],"mature_r7":as_of>=start+7*DAY,"mature_d1":as_of>=start+2*DAY,"mature_d7":as_of>=start+8*DAY,"known_revenue_usd":str(income),"known_impressions":known,"unknown_impressions":unknown,"d1":any(DAY<=t<2*DAY for t in session_times),"d7":any(7*DAY<=t<8*DAY for t in session_times),"repeat_runs":sum(e["installation_id"]==installation and e["name"]=="run_started" and start<=instant(e["timestamp"])<start+7*DAY for e in events.values())})
    groups=[]; uncertainty=[]
    for cohort in ["new","existing"]:
        for variant in ["control","candidate"]:
            all_players=[p for p in players if p["cohort"]==cohort and p["variant"]==variant]
            mature=[p for p in all_players if p["mature_r7"]]
            d1=[p for p in all_players if p["mature_d1"]]; d7=[p for p in all_players if p["mature_d7"]]
            total=sum((Decimal(p["known_revenue_usd"]) for p in mature),Decimal(0))
            known=sum(p["known_impressions"] for p in mature); missing=sum(p["unknown_impressions"] for p in mature)
            groups.append({"cohort":cohort,"variant":variant,"assigned":len(all_players),"mature_r7":len(mature),"known_revenue_usd":str(total),"known_r7_per_assigned_usd":str(total/len(mature)) if mature else None,"money_status":"incomplete" if missing else "observed_export_complete","known_impressions":known,"unknown_impressions":missing,"observed_money_coverage":known/(known+missing) if known+missing else None,"d1_denominator":len(d1),"d1_returned":sum(p["d1"] for p in d1),"d7_denominator":len(d7),"d7_returned":sum(p["d7"] for p in d7),"repeat_runs":sum(p["repeat_runs"] for p in mature)})
        arms=[[float(p["known_revenue_usd"]) for p in players if p["cohort"]==cohort and p["variant"]==v and p["mature_r7"]] for v in ["control","candidate"]]
        if all(arms) and min(map(len,arms))>=2:
            rng=random.Random(17113)
            samples=sorted(statistics.mean(rng.choices(arms[1],k=len(arms[1])))-statistics.mean(rng.choices(arms[0],k=len(arms[0]))) for _ in range(2000))
            uncertainty.append({"cohort":cohort,"delta_known_r7_usd":statistics.mean(arms[1])-statistics.mean(arms[0]),"player_bootstrap_95":[samples[50],samples[1949]],"interpretation":"Observed known revenue only; inspect coverage, maturity and retention before commercial interpretation. No automatic adoption or sample-size claim."})
    funnel=Counter(); blockers=Counter(); quality=Counter()
    selected=[e for e in events.values() if e["installation_id"] in assigned]
    for name, field in [("revive_offer_shown","offerId"),("revive_offer_decided","offerId"),("reward_earned","intentId"),("reward_applied","intentId")]:
        for variant in ["control","candidate"]:
            subset=[e for e in selected if e["name"]==name and assigned[e["installation_id"]]["variant"]==variant and (not name.startswith("reward_") or e["params"].get("kind")=="revive")]
            funnel[f"{variant}:{name}"]=len({e["params"].get(field) for e in subset if e["params"].get(field)})
            if name=="revive_offer_decided":
                for decision in ["accept","back","explicit_decline","expired"]:
                    funnel[f"{variant}:decision:{decision}"]=len({e["params"].get(field) for e in subset if e["params"].get("decision")==decision})
    for e in selected:
        variant=assigned[e["installation_id"]]["variant"]
        if e["name"]=="interstitial_eligibility":
            for reason in e["params"].get("reasons","").split(","):
                if reason: blockers[f"{variant}:{reason}"]+=1
        if e["name"]=="post_revive_checkpoint": quality[f"{variant}:{e['params']['milestone']}"]+=1
    quality_details={}
    for variant in ["control","candidate"]:
        subset=[e for e in selected if assigned[e["installation_id"]]["variant"]==variant and e["name"]=="post_revive_checkpoint"]
        for milestone in ["first_move","old_tray_completed","next_tray_completed","failed_again"]:
            unique={e["params"]["intentId"]:e for e in subset if e["params"].get("milestone")==milestone}
            quality_details[f"{variant}:{milestone}"]={"intents":len(unique),"additional_moves_mean":statistics.mean(e["params"].get("additionalMoves",0) for e in unique.values()) if unique else None,"additional_active_ms_mean":statistics.mean(e["params"].get("additionalActiveMs",0) for e in unique.values()) if unique else None}
        funnel[f"{variant}:revive_impression_offers"]=len({i.get("offerId") for i in impressions.values() if i["installation_id"] in assigned and assigned[i["installation_id"]]["variant"]==variant and i.get("offerId")})
    return {"data_kind":"synthetic technical fixture" if data.get("synthetic") else "provided export; not independently verified","revive_quality_details":quality_details,"currency":"USD","canonical_source":SOURCE,"window":"[assignment_at, assignment_at + 7*24h)","cohort_policy":"All assigned mature players including zero revenue; immature windows reported separately. Manual/test excluded.","limitations":"Coverage concerns observed diagnostic impressions only; absent callbacks/export rows are not proven absent impressions. R7 is neither LTV, profit nor settled payout.","groups":groups,"uncertainty":uncertainty,"funnel":dict(funnel),"interstitial_blockers":dict(blockers),"revive_quality":dict(quality),"players":players}

def write_report(data, destination):
    out=Path(destination);out.mkdir(parents=True,exist_ok=True)
    result=calculate(data)
    (out/"summary.json").write_text(json.dumps(result,indent=2)+"\n")
    if result["players"]:
        with (out/"players.csv").open("w",newline="") as stream:
            writer=csv.DictWriter(stream,fieldnames=list(result["players"][0]));writer.writeheader();writer.writerows(result["players"])
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    groups=[g for g in result["groups"] if g["mature_r7"]]
    fig,ax=plt.subplots(figsize=(7,3));ax.bar([g["cohort"]+" / "+g["variant"] for g in groups],[float(g["known_r7_per_assigned_usd"]) for g in groups]);ax.set_ylabel("Known R7 / assigned player, USD");ax.set_title("Synthetic fixture — not actual revenue" if data.get("synthetic") else "Observed SDK revenue; check missing money and maturity");fig.tight_layout();fig.savefig(out/"r7.svg");plt.close(fig)
    lines=["# SDK revenue comparison", "", result["data_kind"], "", result["cohort_policy"], "", "| Cohort | Arm | Assigned | Mature | Known R7/player USD | Unknown impressions | D1 | D7 |", "|---|---|---:|---:|---:|---:|---:|---:|"]
    for g in result["groups"]: lines.append(f"| {g['cohort']} | {g['variant']} | {g['assigned']} | {g['mature_r7']} | {g['known_r7_per_assigned_usd']} | {g['unknown_impressions']} | {g['d1_returned']}/{g['d1_denominator']} | {g['d7_returned']}/{g['d7_denominator']} |")
    lines += ["", "![Known revenue](r7.svg)", "", result["limitations"], "", "Uncertainty, funnel and revive quality: summary.json. No automatic winner."]
    (out/"report.md").write_text("\n".join(lines)+"\n")
    return result

if __name__=="__main__":
    import sys
    report=write_report(json.loads(Path(sys.argv[1]).read_text()),sys.argv[2])
    print(json.dumps({"groups":report["groups"],"uncertainty":report["uncertainty"]},indent=2))
