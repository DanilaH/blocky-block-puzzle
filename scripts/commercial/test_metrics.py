import copy
import json
import unittest
from pathlib import Path
from metrics import calculate

class MetricsTests(unittest.TestCase):
    def setUp(self): self.data=json.loads(Path(__file__).with_name("example-export.json").read_text())
    def group(self,r,arm): return next(g for g in r["groups"] if g["cohort"]=="new" and g["variant"]==arm)
    def test_zero_players_decimal_and_unknown_are_preserved(self):
        result=calculate(self.data)
        self.assertEqual(self.group(result,"control")["mature_r7"],2)
        self.assertEqual(self.group(result,"control")["known_revenue_usd"],"0")
        self.assertEqual(self.group(result,"candidate")["known_revenue_usd"],"0.012345678901234567")
        self.assertEqual(self.group(result,"candidate")["unknown_impressions"],1)
        self.assertEqual(self.group(result,"candidate")["money_status"],"incomplete")
    def test_duplicate_and_automatic_stream_are_not_additional_money(self):
        original=calculate(self.data)
        duplicate=copy.deepcopy(self.data["revenue"][1]);duplicate["timestamp"]+=100
        self.data["revenue"].append(duplicate)
        self.data["revenue"].append(dict(duplicate,impression_id="auto",source="automatic"))
        self.assertEqual(calculate(self.data)["groups"],original["groups"])
    def test_manual_and_immature_assignments_do_not_turn_into_zero_r7(self):
        self.data["assignments"][0]["mode"]="manual"
        self.data["assignments"][1]["assigned_at"]=self.data["as_of"]-1
        g=self.group(calculate(self.data),"control")
        self.assertEqual(g["assigned"],1);self.assertEqual(g["mature_r7"],0)
        self.assertIsNone(g["known_r7_per_assigned_usd"])
    def test_currency_mismatch_and_conflicting_duplicates_fail_closed(self):
        self.data["revenue"][0]["currency"]="RUB"
        with self.assertRaises(ValueError): calculate(self.data)
        self.setUp();self.data["revenue"].append(dict(self.data["revenue"][0],amount="1"))
        with self.assertRaises(ValueError): calculate(self.data)
    def test_retention_windows_have_separate_mature_denominators(self):
        result=calculate(self.data)
        self.assertEqual(self.group(result,"candidate")["d1_returned"],1)
        self.assertEqual(self.group(result,"control")["d7_returned"],1)
        self.data["as_of"]=self.data["assignments"][0]["assigned_at"]+7*86400
        self.assertEqual(self.group(calculate(self.data),"control")["d7_denominator"],0)

if __name__=="__main__": unittest.main()
