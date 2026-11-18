"""Normalize events.csv and ad_revenue_events.csv from AppMetrica Logs API.
Exports are local inputs; no credentials, network calls or financial retry.
"""
import csv
import json
import sys
from pathlib import Path

def truth(value): return value is True or str(value).lower()=="true"
def normalize(events_file, revenue_file, as_of):
    out={"as_of":as_of,"assignments":[],"events":[],"impressions":[],"revenue":[]}
    with open(events_file,newline="") as stream:
        for row in csv.DictReader(stream):
            p=json.loads(row.get("event_json") or "{}")
            common={"installation_id":row["installation_id"],"timestamp":float(row["event_timestamp"]),"test_mode":truth(p.get("testMode",False)),"mode":p.get("experimentMode","audience")}
            name=row["event_name"]
            if name=="experiment_assigned":
                out["assignments"].append({**common,"assignment_id":p["assignmentId"],"assigned_at":float(p["assignedAt"])/1000,"variant":p["variantId"],"cohort":p["cohort"],"experiment_id":p["experimentId"],"config_version":p["assignmentVersion"],"mode":"audience"})
            elif name=="bp_ad_impression":
                out["impressions"].append({**common,"impression_id":p["impressionEventId"],"source":p["source"],"revenue_status":p["revenue_status"],"offerId":p.get("offerId"),"intentId":p.get("intentId")})
            else:
                identifier=p.get("eventId")
                if identifier: out["events"].append({**common,"event_id":identifier,"name":name,"params":p})
    with open(revenue_file,newline="") as stream:
        for row in csv.DictReader(stream):
            p=json.loads(row.get("ad_revenue_payload") or "{}")
            if p.get("source")!="blocky_ilrd_v1": continue
            out["revenue"].append({"installation_id":row["installation_id"],"timestamp":float(row["ad_revenue_timestamp"]),"impression_id":p["impressionEventId"],"source":p["source"],"currency":row["ad_revenue_currency"].upper(),"amount":p.get("canonicalAmount",row["ad_revenue"]),"amount_sdk_export":row["ad_revenue"],"precision":row.get("ad_revenue_precision",p.get("precision","unknown")),"test_mode":truth(p.get("testMode",False)),"mode":p.get("experimentMode","audience")})
    return out

if __name__=="__main__":
    result=normalize(sys.argv[1],sys.argv[2],sys.argv[3])
    Path(sys.argv[4]).write_text(json.dumps(result,indent=2)+"\n")
