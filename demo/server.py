"""TrustHR demo: Sales -> Finance transfer (TR-104). Stdlib only. Run: python3 server.py"""
import json, hashlib, time, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------- policy-as-code (deterministic, no LLM) ----------
POLICIES = {
    "v1": {"id": "TRANSFER-REIMB", "version": "v1", "min_amount": 5000,
           "text": "Finance destination AND open reimbursement >= INR 5,000 -> Finance review"},
    "v2": {"id": "TRANSFER-REIMB", "version": "v2", "min_amount": 1,
           "text": "Finance destination AND any open reimbursement -> Finance review"},
}
GOLDEN = {  # (facts, expected) per version
    "v1": [({"dest": "Finance", "reimb": 4999}, "skip"), ({"dest": "Finance", "reimb": 5000}, "review"),
           ({"dest": "Finance", "reimb": 0}, "skip"), ({"dest": "Sales", "reimb": 9000}, "skip"),
           ({"dest": "Finance", "reimb": None}, "exception")],
    "v2": [({"dest": "Finance", "reimb": 1}, "review"), ({"dest": "Finance", "reimb": 0}, "skip"),
           ({"dest": "Sales", "reimb": 9000}, "skip"), ({"dest": "Finance", "reimb": None}, "exception")],
}

def evaluate(version, facts):
    p = POLICIES[version]
    if facts.get("reimb") is None:
        return "exception"                      # missing data -> human
    if facts["dest"] == "Finance" and facts["reimb"] >= p["min_amount"] and facts["reimb"] > 0:
        return "review"
    return "skip"

def run_golden(version):
    res = [{"facts": f, "expected": e, "got": evaluate(version, f)} for f, e in GOLDEN[version]]
    return all(r["expected"] == r["got"] for r in res), res

# ---------- guardrail gateway ----------
CATALOG = {
    "directory.update_manager": "routine", "it.open_ticket": "routine",
    "notify.manager": "routine", "finance.open_task": "routine",
    "hr.commit_transfer": "reserved", "hr.change_role": "reserved", "payroll.change_salary": "reserved",
}

# ---------- state ----------
S = {}
def reset():
    POLICIES["v2"]["min_amount"] = 1
    S.clear()
    S.update(active="v1", paused=False, audit=[], tasks=[], ledger={}, receipts={}, decisions=[],
             case=None, approvals=[], events_seen=0)
    cohort = [("E-104", "Finance", 3500, "pending"), ("E-201", "Finance", 8000, "pending"),
              ("E-202", "Finance", 2000, "pending")]
    cohort += [(f"E-{300+i}", "Finance", 0, "pending") for i in range(5)]
    cohort += [("E-401", "Finance", 6000, "completed"), ("E-402", "Finance", 1000, "completed"),
               ("E-501", "Sales", 7000, "pending"), ("E-502", "IT", 300, "pending")]
    S["cohort"] = [{"emp": e, "dest": d, "reimb": r, "status": s} for e, d, r, s in cohort]
    audit("system", "reset", {}, "ok")

def audit(actor, action, detail, outcome):
    prev = S["audit"][-1]["hash"] if S["audit"] else "GENESIS"
    entry = {"n": len(S["audit"]) + 1, "t": time.strftime("%H:%M:%S"), "actor": actor, "action": action,
             "detail": detail, "outcome": outcome, "policy": S.get("active")}
    entry["hash"] = hashlib.sha256((prev + json.dumps(entry, sort_keys=True)).encode()).hexdigest()[:12]
    entry["prev"] = prev[:12]
    S["audit"].append(entry)

def gateway(actor, action, args, approval=None):
    """The ONLY path to HR systems. Fail-closed."""
    risk = CATALOG.get(action)
    if risk is None:
        verdict, why = "deny", "unknown action (fail-closed)"
    elif S["paused"]:
        verdict, why = "paused", "kill switch on; parked in human queue"
    elif risk == "reserved" and not (actor.startswith("human:") and approval):
        verdict, why = "require_human", "reserved action: named human approval required"
        if not any(a["action"] == action and a["args"] == args for a in S["approvals"]):
            S["approvals"].append({"action": action, "args": args, "by": "hr.approver"})
    else:
        verdict, why = "allow", "ok"
    audit(actor, action, {"args": args, "why": why}, verdict)
    return verdict, why

def dispatch(actor, action, key, args):
    v, why = gateway(actor, action, args)
    if v != "allow":
        return v, None
    if key not in S["receipts"]:                # idempotent executor
        S["receipts"][key] = f"RCPT-{len(S['receipts'])+1:03d}"
    return v, S["receipts"][key]

# ---------- event graph ----------
def event_id(emp, typ, date, payload):
    return hashlib.sha256(json.dumps([emp, typ, date, payload], sort_keys=True).encode()).hexdigest()[:10]

def plan_and_run(eid, emp):
    facts = {"dest": "Finance", "reimb": 3500}
    reimb = evaluate(S["active"], facts)
    S["decisions"].append({"emp": emp, "event": eid, "policy": S["active"], "facts": facts, "outcome": reimb})
    nodes = [
        ("directory_sync", "initiate", "Directory", "directory.update_manager", "New manager differs", None),
        ("it_access_review", "initiate", "IT", "it.open_ticket", "Old/new access profiles differ", None),
        ("manager_handover", "initiate", "New manager", "notify.manager", "Manager changes; waits for directory sync", "directory_sync"),
        ("cost_centre_review", "review", "Finance", "finance.open_task", "Cost centres differ; human decision", None),
    ]
    if reimb == "review":
        nodes.append(("reimbursement_review", "review", "Finance", "finance.open_task",
                      f"INR {facts['reimb']} open reimbursement meets {S['active']}", None))
    else:
        S["tasks"].append({"node": "reimbursement_review", "owner": "-", "status": "SKIPPED", "cls": "leave unchanged",
                           "reason": f"INR {facts['reimb']} below threshold under {S['active']}", "receipt": None, "event": eid})
    S["tasks"].append({"node": "equipment_review", "owner": "-", "status": "SKIPPED", "cls": "leave unchanged",
                       "reason": "Equipment profiles match; avoids duplicate order", "receipt": None, "event": eid})
    for node, cls, owner, action, reason, dep in nodes:
        S["tasks"].append({"node": node, "owner": owner, "status": "PENDING", "cls": cls, "reason": reason,
                           "action": action, "dep": dep, "receipt": None, "event": eid})
    advance(eid)

def advance(eid):
    for t in S["tasks"]:
        if t["event"] != eid or t["status"] not in ("PENDING", "PARKED"):
            continue
        dep = t.get("dep")
        if dep and not any(x["node"] == dep and x["event"] == eid and x["status"] == "SUCCEEDED" for x in S["tasks"]):
            continue
        v, rc = dispatch("agent:runner", t["action"], f"{eid}:{t['node']}", {"node": t["node"]})
        if v == "paused":
            t["status"] = "PARKED"
        elif v == "allow":
            t["receipt"] = rc
            t["status"] = "SUCCEEDED" if t["node"] == "directory_sync" else "AWAITING_ACK"
    if any(t["event"] == eid and t["node"] == "directory_sync" and t["status"] == "SUCCEEDED" for t in S["tasks"]):
        for t in S["tasks"]:
            if t["event"] == eid and t["status"] == "PENDING":
                advance(eid); break
    check_close()

def check_close():
    if S["case"] and S["case"]["status"] == "RUNNING":
        mine = [t for t in S["tasks"] if t["event"] == S["case"]["event"]]
        if mine and all(t["status"] in ("SUCCEEDED", "SKIPPED", "ACKED") for t in mine):
            S["case"]["status"] = "COMPLETED"
            audit("system", "case.complete", {"case": "TR-104"}, "ok")

def commit_and_emit():
    c = S["case"]
    eid = event_id("E-104", "Transferred", "demo-date", {"from": "Sales", "to": "Finance"})
    c["event"] = eid
    if eid in S["ledger"]:
        audit("system", "event.redelivered", {"event": eid}, "already processed")
        return "already processed"
    S["ledger"][eid] = True
    plan_and_run(eid, "E-104")
    return "processed"

# ---------- API ----------
def state():
    ok1, _ = run_golden("v1"); ok2, _ = run_golden("v2")
    return {"active": S["active"], "paused": S["paused"], "case": S["case"], "tasks": S["tasks"],
            "audit": S["audit"], "approvals": S["approvals"], "decisions": S["decisions"],
            "policies": POLICIES, "golden": {"v1": ok1, "v2": ok2},
            "receipts": len(S["receipts"]), "task_count": len([t for t in S["tasks"] if t["status"] != "SKIPPED"])}

def api(path, body):
    if path == "/api/state":
        return state()
    if path == "/api/reset":
        reset(); return state()
    if path == "/api/request":   # employee/manager in chat
        S["case"] = {"id": "TR-104", "emp": "E-104", "from": "Sales", "to": "Finance", "status": "AWAITING_APPROVAL", "event": None}
        audit("user:manager", "transfer.request", {"emp": "E-104"}, "case created")
        return {"msg": "Case TR-104 created; waiting for named HR approval."}
    if path == "/api/agent_role_change":   # demo: agent tries a reserved action
        v, why = gateway("agent:intake", "hr.change_role", {"emp": "E-104", "role": "Finance Analyst"})
        return {"verdict": v, "msg": why}
    if path == "/api/approve":
        if not S["case"] or S["case"]["status"] != "AWAITING_APPROVAL":
            return {"msg": "No case awaiting approval."}
        v, why = gateway("human:hr.approver", "hr.commit_transfer", {"emp": "E-104"}, approval="APR-1")
        if v != "allow":
            return {"msg": f"Commit {v}: {why}"}
        S["case"]["status"] = "RUNNING"
        return {"msg": "Event commit: " + commit_and_emit()}
    if path == "/api/redeliver":
        if not S["case"] or not S["case"].get("event"):
            return {"msg": "Nothing to redeliver yet."}
        return {"msg": "Event redelivered: " + commit_and_emit()}
    if path == "/api/ack":
        for t in S["tasks"]:
            if t["node"] == body["node"] and t["status"] == "AWAITING_ACK":
                t["status"] = "ACKED"
                audit(f"human:{t['owner']}", "task.ack", {"node": t["node"]}, "ok")
        if S["case"]: advance(S["case"]["event"]); check_close()
        return {"msg": "ok"}
    if path == "/api/pause":
        S["paused"] = bool(body["on"])
        audit("human:hr.admin", "kill_switch", {"on": S["paused"]}, "ok")
        if not S["paused"] and S["case"] and S["case"].get("event"):
            advance(S["case"]["event"])
        return {"msg": "paused" if S["paused"] else "resumed"}
    if path == "/api/simulate":   # read-only dry run, v1 vs v2 on pinned snapshot
        before = len(S["tasks"]) + len(S["receipts"])
        rows, a, d = [], 0, 0
        for c in S["cohort"]:
            if c["status"] != "pending" or c["dest"] != "Finance":
                rows.append({**c, "v1": "-", "v2": "-", "changed": False, "scope": "coverage only"}); continue
            o1, o2 = evaluate("v1", c), evaluate("v2", c)
            a += o1 == "review"; d += o2 == "review"
            rows.append({**c, "v1": o1, "v2": o2, "changed": o1 != o2, "scope": "in scope"})
        ok, tests = run_golden("v2")
        return {"rows": rows, "v1_reviews": a, "v2_reviews": d, "golden_v2_pass": ok, "tests": tests,
                "writes": len(S["tasks"]) + len(S["receipts"]) - before}
    if path == "/api/activate":
        ver = body["version"]
        ok, tests = run_golden(ver)
        if not ok:
            audit("human:hr.approver", "policy.activate", {"version": ver}, "BLOCKED: golden test failed")
            return {"msg": "Activation blocked: golden tests failing."}
        S["active"] = ver
        audit("human:hr.approver", "policy.activate", {"version": ver}, "ok")
        return {"msg": f"Policy {ver} active (new decisions only; past decisions stay pinned)."}
    if path == "/api/replay":
        if not S["decisions"]: return {"msg": "No decision yet."}
        d = S["decisions"][0]
        again = evaluate(d["policy"], d["facts"])
        return {"msg": f"Replay of {d['emp']} under original {d['policy']}: {again} (original: {d['outcome']}). "
                       f"Today's active policy is {S['active']} -> would give {evaluate(S['active'], d['facts'])}."}
    if path == "/api/break_policy":   # demo: golden test fails and blocks publish
        POLICIES["v2"]["min_amount"] = 5000
        return {"msg": "v2 threshold edited to 5000 (draft)."}
    return {"msg": "unknown"}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.send(api(self.path, {}))
        html = open(os.path.join(os.path.dirname(__file__), "index.html"), "rb").read()
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(html)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        self.send(api(self.path, body))
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def send(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

if __name__ == "__main__":
    reset()
    port = int(os.environ.get("PORT", 8000))
    print(f"TrustHR demo on http://0.0.0.0:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
