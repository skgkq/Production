import { normalizeOps, topologicalSort } from "./dag.js";
import { initRoomTimelines } from "./rooms.js";
import { findBestRoomSlot, normalizeCst } from "./shift.js";
import { OP_COLORS } from "../data/opsSeed.js";

/**
 * 贪心排产：DAG 前序 + 房间资格 + 房间时间线互斥
 */
export function runSchedule(plan, ops, cst, opts = {}) {
  cst = normalizeCst(cst);
  const { minStart = 0, frozenEvents = [] } = opts;

  const { ops: normOps, errors } = normalizeOps(ops);
  if (errors.length) {
    return { events: [], errors };
  }

  const roomTls = initRoomTimelines(cst.roomList, frozenEvents);
  const workerTl = [];
  for (const e of frozenEvents) {
    if (e.workers > 0) workerTl.push({ start: e.start, end: e.end, workers: e.workers });
  }

  const sortedPlan = [...plan].sort((a, b) => a.priority - b.priority);
  const batches = [];
  let woCnt = 1;
  for (const task of sortedPlan) {
    for (let b = 0; b < task.batches; b++) {
      batches.push({ task, batchNum: b + 1, wo: woCnt++ });
    }
  }

  const events = [];
  const topo = topologicalSort(normOps);

  for (const batch of batches) {
    const opEnds = {};
    const doneOpIds = new Set();

    const frozenForBatch = frozenEvents.filter(
      e => e.batchNum === batch.batchNum && e.wo === `WO-${String(batch.wo).padStart(3, "0")}`
    );
    for (const e of frozenForBatch) {
      const oid = e.opId || normOps[e.opIdx]?.id;
      if (oid) {
        doneOpIds.add(oid);
        opEnds[oid] = e.end;
      }
    }

    let remaining = topo.filter(op => !doneOpIds.has(op.id));
    let guard = 0;

    while (remaining.length && guard < 500) {
      guard++;
      let scheduledAny = false;

      for (const op of [...remaining]) {
        const depsReady = op.deps.every(d => doneOpIds.has(d));
        if (!depsReady) continue;

        const depEnds = op.deps.map(d => opEnds[d] ?? minStart);
        const minS = Math.max(minStart, ...(depEnds.length ? depEnds : [minStart]));

        const { start, room } = findBestRoomSlot(op, roomTls, minS, cst, workerTl);
        if (start === Infinity) {
          return {
            events: [],
            errors: [`工步 ${op.id}（${op.name}）在房间 ${op.rooms.join(",")} 找不到可行时间槽`],
          };
        }

        const end = start + op.dur;
        const wo = `WO-${String(batch.wo).padStart(3, "0")}`;

        events.push({
          wo,
          batchNum: batch.batchNum,
          batchLabel: `批${batch.batchNum}`,
          opId: op.id,
          opName: op.name,
          opGroup: op.group || null,
          subOps: op.subOps || "",
          opIdx: normOps.findIndex(o => o.id === op.id),
          room,
          start,
          end,
          dur: op.dur,
          workers: op.workers || 1,
          color: OP_COLORS[op.id] || "#64748b",
          note: batch.task.note || "",
        });

        if (!roomTls[room]) roomTls[room] = [];
        roomTls[room].push({ start, end });
        roomTls[room].sort((a, b) => a.start - b.start);
        if (op.workers > 0) workerTl.push({ start, end, workers: op.workers });

        opEnds[op.id] = end;
        doneOpIds.add(op.id);
        remaining = remaining.filter(o => o.id !== op.id);
        scheduledAny = true;
      }

      if (!scheduledAny) {
        return {
          events: [],
          errors: ["DAG 调度停滞：可能存在未满足的依赖或环路"],
        };
      }
    }
  }

  return { events: events.sort((a, b) => a.start - b.start), errors: [] };
}

export function computeStats(events, cst) {
  if (!events.length) return null;
  const makespan = events.reduce((mx, e) => Math.max(mx, e.end), 0);
  const batchCount = new Set(events.map(e => e.wo)).size;
  const opCount = events.length;
  const roomBusy = {};
  for (const r of cst.roomList) {
    const busy = events.filter(e => e.room === r).reduce((s, e) => s + e.dur, 0);
    const span = makespan > 0 ? (busy / makespan) * 100 : 0;
    roomBusy[r] = { busy, util: span };
  }
  return { makespan, batchCount, opCount, roomBusy };
}
