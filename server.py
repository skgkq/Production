"""
FastAPI 后端 — 为排产系统提供 HGNN+PPO 智能调度 API
启动: python server.py  (默认端口 8000)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from scheduler_hgnn import solve_fjsp

app = FastAPI(title="Line1 Scheduler API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class OpDef(BaseModel):
    id: str
    name: str
    eq: str
    dur: float
    workers: int = 1
    cleanDur: float = 0
    agv: float = 0
    isMix: bool = False
    matA: float = 0
    matB: float = 0
    release: float = 0


class TypeDef(BaseModel):
    id: str
    code: str
    color: str
    ops: list[OpDef]


class TaskDef(BaseModel):
    id: str
    typeId: str
    batches: int
    priority: int
    note: str = ""


class Constraints(BaseModel):
    totalWorkers: int = 4
    stockMatA: float = 200
    stockMatB: float = 80
    stockRelease: float = 10
    shiftStart: int = 9
    shiftEnd: int = 18
    lunchStart: int = 12
    lunchEnd: int = 13
    workDays: int = 5


class FailureDef(BaseModel):
    eq: str
    start: float
    end: float
    reason: str = ""


class EventDef(BaseModel):
    wo: str
    batchLabel: str = ""
    batchNum: int = 1
    ptId: str
    ptCode: str = ""
    ptColor: str = ""
    opName: str = ""
    opIdx: int
    eq: str
    start: float
    end: float
    dur: float = 0
    workers: int = 1
    isCleaning: bool = False
    note: str = ""
    locked: bool = False
    isNew: bool = False
    status: str = ""


class ScheduleRequest(BaseModel):
    plan: list[TaskDef]
    types: list[TypeDef]
    cst: Constraints
    episodes: int = 300


class RescheduleRequest(BaseModel):
    plan: list[TaskDef]
    types: list[TypeDef]
    cst: Constraints
    currentEvents: list[EventDef]
    rescheduleAt: float
    failures: list[FailureDef] = []
    episodes: int = 300


# ── 班次 / 设备槽位工具 ───────────────────────────────────────────

def overlaps_failure(eq, start, dur, failures):
    end = start + dur
    for f in failures or []:
        if f.eq != eq:
            continue
        if start < f.end and end > f.start:
            return f.end
    return None


def make_slot_finder(cst, eq_timelines, failures=None):
    failures = failures or []

    def next_work_start(t):
        for _ in range(500):
            if t >= cst.workDays * 24:
                return float("inf")
            day = int(t // 24)
            h = t % 24
            if h < cst.shiftStart:
                t = day * 24 + cst.shiftStart
                continue
            if h >= cst.shiftEnd:
                t = (day + 1) * 24 + cst.shiftStart
                continue
            if cst.lunchStart <= h < cst.lunchEnd:
                t = day * 24 + cst.lunchEnd
                continue
            return t
        return float("inf")

    def find_slot(eq, min_start, dur):
        t = next_work_start(min_start)
        for _ in range(50000):
            if t == float("inf"):
                return float("inf")
            t = next_work_start(t)
            if t == float("inf"):
                return float("inf")
            day_base = int(t // 24) * 24
            shift_end = day_base + cst.shiftEnd
            if t + dur > shift_end:
                t = next_work_start(shift_end)
                continue
            ls = day_base + cst.lunchStart
            le = day_base + cst.lunchEnd
            if t < le and t + dur > ls:
                t = day_base + cst.lunchEnd
                continue
            fail_end = overlaps_failure(eq, t, dur, failures)
            if fail_end is not None:
                t = next_work_start(fail_end)
                continue
            clash = False
            for blk in eq_timelines[eq]:
                if blk[0] < t + dur and blk[1] > t:
                    t = next_work_start(blk[1])
                    clash = True
                    break
            if clash:
                continue
            return t
        return float("inf")

    return find_slot


def expand_batches(plan, type_map):
    batches = []
    wo_cnt = 1
    for task in sorted(plan, key=lambda t: t.priority):
        pt = type_map.get(task.typeId)
        if not pt:
            continue
        for b in range(task.batches):
            batches.append({"task": task, "pt": pt, "batchNum": b + 1, "wo": wo_cnt})
            wo_cnt += 1
    return batches


def build_eq_index(types):
    eq_set = set()
    for pt in types:
        for op in pt.ops:
            eq_set.add(op.eq)
    eq_list = sorted(eq_set)
    return eq_list, {eq: i for i, eq in enumerate(eq_list)}


def build_proc_jobs(batches, eq_to_idx, start_op_indices):
    """start_op_indices: 与 batches 等长的每批次起始工序下标"""
    proc = []
    batch_meta = []
    for idx, batch in enumerate(batches):
        pt = batch["pt"]
        start_op = start_op_indices[idx] if idx < len(start_op_indices) else 0
        job_ops = []
        meta_ops = []
        for op_idx in range(start_op, len(pt.ops)):
            op = pt.ops[op_idx]
            m_idx = eq_to_idx[op.eq]
            total_dur = op.dur + (op.cleanDur or 0) + (op.agv or 0)
            job_ops.append({m_idx: total_dur})
            meta_ops.append({"op": op, "orig_op_idx": op_idx})
        proc.append(job_ops)
        batch_meta.append({"batch": batch, "ops": meta_ops})
    return proc, batch_meta


def emit_event(batch, op, op_idx, eq, start, end, dur, is_new=False):
    pt = batch["pt"]
    extras = []
    if op.cleanDur:
        extras.append(f"清洗{op.cleanDur}h")
    if op.agv:
        extras.append(f"AGV{op.agv}h")
    op_name = op.name + (f"(含{'+ '.join(extras)})" if extras else "")
    return {
        "wo": f"WO-{str(batch['wo']).zfill(3)}",
        "batchLabel": f"{pt.code}-批{batch['batchNum']}",
        "batchNum": batch["batchNum"],
        "ptId": pt.id,
        "ptCode": pt.code,
        "ptColor": pt.color,
        "opName": op_name,
        "opIdx": op_idx,
        "eq": eq,
        "start": start,
        "end": end,
        "dur": dur,
        "workers": op.workers,
        "isCleaning": False,
        "note": batch["task"].note,
        "isNew": is_new,
    }


def map_hgnn_to_events(schedule, proc, batch_meta, idx_to_eq, cst, eq_timelines, job_end_times,
                       failures=None, min_start_floor=0.0, mark_new=False):
    find_slot = make_slot_finder(cst, eq_timelines, failures)
    events = []
    raw_events = []
    for (j, o), (m, start, _end) in schedule.items():
        raw_events.append((start, j, o, m))
    raw_events.sort()

    for _, j, o, m in raw_events:
        meta = batch_meta[j]
        batch = meta["batch"]
        op_meta = meta["ops"][o]
        op = op_meta["op"]
        orig_op_idx = op_meta["orig_op_idx"]
        eq = idx_to_eq[m]
        dur = proc[j][o][m]

        min_start = max(job_end_times[j], min_start_floor)
        start = find_slot(eq, min_start, dur)
        end = start + dur

        eq_timelines[eq].append((start, end))
        eq_timelines[eq].sort()
        job_end_times[j] = end

        events.append(emit_event(batch, op, orig_op_idx, eq, start, end, dur, is_new=mark_new))

    events.sort(key=lambda e: e["start"])
    return events


def classify_reschedule(current_events, reschedule_at, failures):
    frozen = []
    batch_progress = {}

    for e in current_events:
        ev = e.model_dump() if hasattr(e, "model_dump") else dict(e)
        batch_key = f"{ev['ptId']}|{int(ev['wo'].replace('WO-', ''))}"

        if ev["end"] <= reschedule_at:
            frozen.append(ev)
            batch_progress[batch_key] = max(batch_progress.get(batch_key, 0), ev["opIdx"] + 1)
        elif ev["start"] <= reschedule_at:
            fail_end = overlaps_failure(ev["eq"], ev["start"], ev["end"] - ev["start"], failures)
            if fail_end is not None and fail_end > reschedule_at:
                if batch_key not in batch_progress:
                    batch_progress[batch_key] = ev["opIdx"]
                else:
                    batch_progress[batch_key] = min(batch_progress[batch_key], ev["opIdx"])
            else:
                frozen.append(ev)
                batch_progress[batch_key] = max(batch_progress.get(batch_key, 0), ev["opIdx"] + 1)

    frozen_marked = [
        {
            **e,
            "locked": True,
            "isNew": False,
            "status": "DONE" if e["end"] <= reschedule_at else "RUNNING",
        }
        for e in frozen
    ]
    return frozen_marked, batch_progress


def merge_reschedule_events(frozen_marked, new_events):
    merged = [
        *frozen_marked,
        *[
            e for e in new_events
            if not any(f["wo"] == e["wo"] and f["opIdx"] == e["opIdx"] for f in frozen_marked)
        ],
    ]
    merged.sort(key=lambda e: e["start"])
    return merged


def run_hgnn_schedule(plan, types, cst, episodes, failures=None, frozen_marked=None,
                      batch_progress=None, reschedule_at=0.0):
    type_map = {t.id: t for t in types}
    batches = expand_batches(plan, type_map)
    if not batches:
        return {"events": [], "makespan": 0}

    eq_list, eq_to_idx = build_eq_index(types)
    n_machines = len(eq_list)
    idx_to_eq = {i: eq for eq, i in eq_to_idx.items()}

    start_op_indices = []
    active_job_indices = []
    for batch in batches:
        batch_key = f"{batch['pt'].id}|{batch['wo']}"
        start_op = (batch_progress or {}).get(batch_key, 0)
        start_op_indices.append(start_op)
        if start_op < len(batch["pt"].ops):
            active_job_indices.append(len(start_op_indices) - 1)

    if not active_job_indices:
        events = frozen_marked or []
        return {
            "events": events,
            "makespan": max((e["end"] for e in events), default=0),
        }

    active_batches = [batches[i] for i in active_job_indices]
    active_start_ops = [start_op_indices[i] for i in active_job_indices]

    proc_all, batch_meta_all = build_proc_jobs(active_batches, eq_to_idx, active_start_ops)
    proc, batch_meta = [], []
    for job, meta in zip(proc_all, batch_meta_all):
        if job:
            proc.append(job)
            batch_meta.append(meta)

    if not proc:
        events = frozen_marked or []
        return {
            "events": events,
            "makespan": max((e["end"] for e in events), default=0),
        }

    schedule, _ = solve_fjsp(proc, n_machines, n_episodes=episodes)
    if schedule is None:
        return {"events": [], "makespan": 0, "error": "求解失败"}

    eq_timelines = {eq: [] for eq in eq_list}
    for e in frozen_marked or []:
        eq_timelines[e["eq"]].append((e["start"], e["end"]))
    for eq in eq_list:
        eq_timelines[eq].sort()

    job_end_times = [reschedule_at] * len(batch_meta)
    for j, meta in enumerate(batch_meta):
        batch = meta["batch"]
        wo = f"WO-{str(batch['wo']).zfill(3)}"
        frozen_for_batch = [
            e for e in (frozen_marked or [])
            if e["ptId"] == batch["pt"].id and e["wo"] == wo
        ]
        if frozen_for_batch:
            job_end_times[j] = max(job_end_times[j], *(e["end"] for e in frozen_for_batch))

    new_events = map_hgnn_to_events(
        schedule, proc, batch_meta, idx_to_eq, cst, eq_timelines, job_end_times,
        failures=failures, min_start_floor=reschedule_at, mark_new=bool(frozen_marked),
    )

    if frozen_marked:
        events = merge_reschedule_events(frozen_marked, new_events)
    else:
        events = new_events

    final_makespan = max((e["end"] for e in events), default=0)
    return {"events": events, "makespan": final_makespan}


@app.post("/api/schedule/hgnn-ppo")
def schedule_hgnn_ppo(req: ScheduleRequest):
    result = run_hgnn_schedule(req.plan, req.types, req.cst, req.episodes)
    if result.get("error"):
        return result
    return result


@app.post("/api/schedule/hgnn-ppo/reschedule")
def schedule_hgnn_reschedule(req: RescheduleRequest):
    failures = req.failures
    frozen_marked, batch_progress = classify_reschedule(
        req.currentEvents, req.rescheduleAt, failures
    )

    result = run_hgnn_schedule(
        req.plan, req.types, req.cst, req.episodes,
        failures=failures,
        frozen_marked=frozen_marked,
        batch_progress=batch_progress,
        reschedule_at=req.rescheduleAt,
    )
    if result.get("error"):
        return result

    new_count = sum(1 for e in result["events"] if e.get("isNew"))
    result["stats"] = {
        "frozenCount": len(frozen_marked),
        "newCount": new_count,
    }
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
