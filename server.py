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


class ScheduleRequest(BaseModel):
    plan: list[TaskDef]
    types: list[TypeDef]
    cst: Constraints
    episodes: int = 300


@app.post("/api/schedule/hgnn-ppo")
def schedule_hgnn_ppo(req: ScheduleRequest):
    type_map = {t.id: t for t in req.types}
    cst = req.cst

    # 展开 plan → batch 列表 (按优先级排序)
    batches = []
    wo_cnt = 1
    for task in sorted(req.plan, key=lambda t: t.priority):
        pt = type_map.get(task.typeId)
        if not pt:
            continue
        for b in range(task.batches):
            batches.append({"task": task, "pt": pt, "batchNum": b + 1, "wo": wo_cnt})
            wo_cnt += 1

    if not batches:
        return {"events": [], "makespan": 0}

    # 收集所有设备 → machine_idx 映射
    eq_set = set()
    for pt in req.types:
        for op in pt.ops:
            eq_set.add(op.eq)
    eq_list = sorted(eq_set)
    eq_to_idx = {eq: i for i, eq in enumerate(eq_list)}
    n_machines = len(eq_list)

    # 构建 FJSP proc 数据: proc[job_idx][op_idx] = {machine_idx: duration}
    # 每个 batch 是一个 job，每个 batch 的工序序列来自其产品类型
    # 清洗时间合并进工序总时长
    proc = []
    batch_meta = []  # 保存每个 job 的元信息，用于还原 events

    for batch in batches:
        pt = batch["pt"]
        job_ops = []
        meta_ops = []
        for op in pt.ops:
            m_idx = eq_to_idx[op.eq]
            total_dur = op.dur + (op.cleanDur or 0) + (op.agv or 0)
            job_ops.append({m_idx: total_dur})
            meta_ops.append({"op": op})
        proc.append(job_ops)
        batch_meta.append({"batch": batch, "ops": meta_ops})

    # 求解 FJSP
    schedule, makespan_raw = solve_fjsp(proc, n_machines, n_episodes=req.episodes)

    if schedule is None:
        return {"events": [], "makespan": 0, "error": "求解失败"}

    # 后处理: 将 FJSP 结果映射到班次约束下的实际时间
    # FJSP 求解器产出的是无约束连续时间，需要映射到工作日/班次时间轴
    idx_to_eq = {i: eq for eq, i in eq_to_idx.items()}

    events = []
    # 收集所有事件并按原始 start 排序
    raw_events = []
    for (j, o), (m, start, end) in schedule.items():
        raw_events.append((start, j, o, m, end))
    raw_events.sort()

    # 重新在班次时间轴上安排 (贪心重排)
    eq_timelines = {eq: [] for eq in eq_list}
    job_end_times = [0.0] * len(batches)

    def next_work_start(t):
        for _ in range(500):
            if t >= cst.workDays * 24:
                return float('inf')
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
        return float('inf')

    def find_slot(eq, min_start, dur):
        t = next_work_start(min_start)
        for _ in range(50000):
            if t == float('inf'):
                return float('inf')
            t = next_work_start(t)
            if t == float('inf'):
                return float('inf')
            day_base = int(t // 24) * 24
            shift_end = day_base + cst.shiftEnd
            if t + dur > shift_end:
                t = next_work_start(shift_end)
                continue
            # 午休检查
            ls = day_base + cst.lunchStart
            le = day_base + cst.lunchEnd
            if t < le and t + dur > ls:
                t = day_base + cst.lunchEnd
                continue
            # 设备冲突检查
            clash = False
            for blk in eq_timelines[eq]:
                if blk[0] < t + dur and blk[1] > t:
                    t = next_work_start(blk[1])
                    clash = True
                    break
            if clash:
                continue
            return t
        return float('inf')

    # 按 FJSP 求解顺序安排，保持 job 内工序顺序
    for _, j, o, m, _ in raw_events:
        meta = batch_meta[j]
        batch = meta["batch"]
        op_meta = meta["ops"][o]
        eq = idx_to_eq[m]
        dur = proc[j][o][m]

        min_start = job_end_times[j]
        start = find_slot(eq, min_start, dur)
        end = start + dur

        eq_timelines[eq].append((start, end))
        eq_timelines[eq].sort()
        job_end_times[j] = end

        pt = batch["pt"]
        op = op_meta["op"]
        extras = []
        if op.cleanDur: extras.append(f"清洗{op.cleanDur}h")
        if op.agv: extras.append(f"AGV{op.agv}h")
        op_name = op.name + (f"(含{'+ '.join(extras)})" if extras else "")

        events.append({
            "wo": f"WO-{str(batch['wo']).zfill(3)}",
            "batchLabel": f"{pt.code}-批{batch['batchNum']}",
            "batchNum": batch["batchNum"],
            "ptId": pt.id,
            "ptCode": pt.code,
            "ptColor": pt.color,
            "opName": op_name,
            "opIdx": o,
            "eq": eq,
            "start": start,
            "end": end,
            "dur": dur,
            "workers": op.workers,
            "isCleaning": False,
            "note": batch["task"].note,
        })

    events.sort(key=lambda e: e["start"])
    final_makespan = max((e["end"] for e in events), default=0)

    return {"events": events, "makespan": final_makespan}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
