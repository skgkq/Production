import { useState, useMemo, useEffect } from "react";
// import { AgentWidget } from "./components/agent";  // 智能客服：汇报前暂不展示，取消注释即可启用

// ══════════════════════════════════════════════════════════════════
//  一号线日/周排产系统  v4 (支持动态重调度)
//  一台混合锅 · 多型号 · 班次约束 · 换产/清洗/AGV约束 · 工单输出
//  v4 新增:插单 / 设备故障 / 滚动重排
// ══════════════════════════════════════════════════════════════════

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
                 "#ec4899","#06b6d4","#84cc16","#f43f5e","#a78bfa"];
const DAYS_ZH = ["周一","周二","周三","周四","周五","周六","周日"];
const EQ_ORDER = ["称量台","搅拌机","混合锅","成型台","整装区"];
const CLEAN_COL = "#94a3b8";

let _uid = 0;
const uid = () => `i${++_uid}`;

// ─── Default product types (型号) ────────────────────────────────
const DEFAULT_TYPES = [
  {
    id:"pt1", code:"A型", color:PALETTE[0],
    ops:[
      {id:"a1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"a2",name:"预混",    eq:"搅拌机",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"a3",name:"混合",    eq:"混合锅",  dur:3.0, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"a4",name:"模具装配",eq:"成型台",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"a5",name:"成型",    eq:"成型台",  dur:4.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"a6",name:"整装",    eq:"整装区",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
  {
    id:"pt2", code:"B型", color:PALETTE[1],
    ops:[
      {id:"b1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"b2",name:"预混",    eq:"搅拌机",  dur:1.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"b3",name:"混合",    eq:"混合锅",  dur:4.0, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"b4",name:"模具装配",eq:"成型台",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"b5",name:"成型",    eq:"成型台",  dur:5.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"b6",name:"整装",    eq:"整装区",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
  {
    id:"pt3", code:"C型", color:PALETTE[2],
    ops:[
      {id:"c1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"c2",name:"预混",    eq:"搅拌机",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"c3",name:"混合",    eq:"混合锅",  dur:2.5, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"c4",name:"模具装配",eq:"成型台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"c5",name:"成型",    eq:"成型台",  dur:3.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"c6",name:"整装",    eq:"整装区",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
];

const DEFAULT_PLAN = [
  {id:"t1", typeId:"pt1", batches:1, priority:1, note:""},
  {id:"t2", typeId:"pt2", batches:1, priority:2, note:""},
];

const DUTY_NAME_POOL = [
  "小李", "小高", "小吴", "小明", "小红", "小芳", "小张", "小王", "小陈", "小刘", "小赵", "小周",
];

function makeDefaultDutyDay() {
  const pool = [...DUTY_NAME_POOL].sort(() => Math.random() - 0.5);
  let idx = 0;
  const take = n => {
    const names = [];
    for (let k = 0; k < n; k++) names.push(pool[idx++ % pool.length]);
    return names;
  };
  return [
    normalizeDutySeg({ id: uid(), start: 8,  end: 12, names: take(2) }),
    normalizeDutySeg({ id: uid(), start: 12, end: 14, names: take(1) }),
    normalizeDutySeg({ id: uid(), start: 14, end: 18, names: take(2) }),
  ];
}

function segDutyCount(seg) {
  if (Array.isArray(seg?.names) && seg.names.length) return seg.names.length;
  return seg?.workers ?? 0;
}

function normalizeDutySeg(seg) {
  let names = Array.isArray(seg?.names) ? seg.names.map(n => String(n).trim()).filter(Boolean) : [];
  if (!names.length && (seg?.workers ?? 0) > 0) {
    for (let i = 0; i < seg.workers; i++) names.push(`人员${i + 1}`);
  }
  return { ...seg, names, workers: names.length };
}

function cloneDutyRoster(roster) {
  return (roster || []).map(seg => normalizeDutySeg({ ...seg, id: uid(), names: [...(seg.names || [])] }));
}

function makeDefaultDutyWeek() {
  return Array.from({ length: 5 }, () => makeDefaultDutyDay());
}

const DEFAULT_CST = {
  stockMatA         : 200,
  stockMatB         : 80,
  stockRelease      : 10,
  shiftStart        : 8,
  shiftEnd          : 18,
  workDays          : 5,
  dutyRosterByDay   : makeDefaultDutyWeek(),
  eqCount           : Object.fromEntries(EQ_ORDER.map(eq => [eq, 1])),
};

function defaultEqCount() {
  return Object.fromEntries(EQ_ORDER.map(eq => [eq, 1]));
}

function normalizeEqCount(eqCount) {
  const base = defaultEqCount();
  if (!eqCount || typeof eqCount !== "object") return base;
  for (const eq of EQ_ORDER) {
    base[eq] = Math.max(1, Math.min(10, Math.floor(Number(eqCount[eq]) || 1)));
  }
  return base;
}

/** 展开设备实例：单台保持原名，多台为 搅拌机1、搅拌机2 … */
function getEqInstances(cst) {
  const counts = normalizeEqCount(normalizeCst(cst).eqCount);
  const list = [];
  for (const eq of EQ_ORDER) {
    const n = counts[eq];
    if (n <= 1) list.push(eq);
    else for (let i = 1; i <= n; i++) list.push(`${eq}${i}`);
  }
  return list;
}

function eqTypeOf(instance) {
  if (EQ_ORDER.includes(instance)) return instance;
  for (const eq of EQ_ORDER) {
    if (instance.startsWith(eq)) {
      const suffix = instance.slice(eq.length);
      if (/^\d+$/.test(suffix)) return eq;
    }
  }
  return instance;
}

function instancesForType(cst, eqType) {
  return getEqInstances(cst).filter(inst => eqTypeOf(inst) === eqType);
}

function initEqTimelines(cst, frozenEvents = []) {
  const tls = Object.fromEntries(getEqInstances(cst).map(inst => [inst, []]));
  for (const e of frozenEvents) {
    const inst = e.eq;
    if (!tls[inst]) tls[inst] = [];
    tls[inst].push({ start: e.start, end: e.end });
  }
  for (const inst of Object.keys(tls)) tls[inst].sort((a, b) => a.start - b.start);
  return tls;
}

function formatEqCountSummary(cst) {
  const counts = normalizeEqCount(normalizeCst(cst).eqCount);
  return EQ_ORDER.map(eq => {
    const n = counts[eq];
    if (n <= 1) return `${eq}×1`;
    const names = Array.from({ length: n }, (_, i) => `${eq}${i + 1}`).join("、");
    return `${eq}×${n}（${names}）`;
  }).join(" · ");
}

function getDutyRosterForDay(cst, dayIdx) {
  const week = cst.dutyRosterByDay;
  if (week?.[dayIdx]?.length) return week[dayIdx];
  if (week?.[0]?.length) return week[0];
  return cst.dutyRoster || [];
}

function normalizeCst(cst) {
  const base = { ...DEFAULT_CST, ...cst, eqCount: normalizeEqCount(cst?.eqCount ?? DEFAULT_CST.eqCount) };
  if (base.dutyRosterByDay?.length) {
    const week = [...base.dutyRosterByDay].map(day =>
      (day || []).map(seg => normalizeDutySeg(seg))
    );
    while (week.length < 5) week.push(makeDefaultDutyDay());
    return { ...base, dutyRosterByDay: week.slice(0, 5) };
  }
  if (cst?.dutyRoster?.length) {
    const template = cloneDutyRoster(cst.dutyRoster);
    return { ...base, dutyRosterByDay: Array.from({ length: 5 }, () => cloneDutyRoster(template)) };
  }
  const shiftStart = cst?.shiftStart ?? DEFAULT_CST.shiftStart;
  const shiftEnd = cst?.shiftEnd ?? DEFAULT_CST.shiftEnd;
  const workers = cst?.totalWorkers ?? 2;
  const single = normalizeDutySeg({
    id: uid(), start: shiftStart, end: shiftEnd,
    names: Array.from({ length: workers }, (_, i) => `人员${i + 1}`),
  });
  return { ...base, dutyRosterByDay: Array.from({ length: 5 }, () => cloneDutyRoster([single])) };
}

function validateDutyRosterForDay(cst, roster, dayLabel) {
  const sorted = [...(roster || [])].sort((a, b) => a.start - b.start);
  const errors = [];
  const prefix = dayLabel ? `${dayLabel}：` : "";
  if (!sorted.length) {
    errors.push(`${prefix}至少需要一个时段`);
    return errors;
  }
  let cursor = cst.shiftStart;
  for (const seg of sorted) {
    if (seg.start >= seg.end) errors.push(`${prefix}时段 ${seg.start}:00–${seg.end}:00 开始须早于结束`);
    if (seg.start < cst.shiftStart || seg.end > cst.shiftEnd) {
      errors.push(`${prefix}时段 ${seg.start}:00–${seg.end}:00 超出班次范围`);
    }
    if (seg.start < cursor) errors.push(`${prefix}时段 ${seg.start}:00–${seg.end}:00 与上一时段重叠`);
    cursor = Math.max(cursor, seg.end);
    if (segDutyCount(seg) < 1) errors.push(`${prefix}时段 ${seg.start}:00–${seg.end}:00 至少添加 1 名值班人员`);
  }
  return errors;
}

function validateDutyRoster(cst) {
  const nc = normalizeCst(cst);
  const errors = [];
  for (let d = 0; d < nc.workDays; d++) {
    errors.push(...validateDutyRosterForDay(nc, getDutyRosterForDay(nc, d), DAYS_ZH[d]));
  }
  return errors;
}

function getDutyRosterGapsForDay(cst, roster) {
  const sorted = [...(roster || [])].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = cst.shiftStart;
  for (const seg of sorted) {
    if (seg.start > cursor) gaps.push({ start: cursor, end: seg.start });
    cursor = Math.max(cursor, seg.end);
  }
  if (cursor < cst.shiftEnd) gaps.push({ start: cursor, end: cst.shiftEnd });
  return gaps;
}

function formatDutyRosterSummary(roster) {
  return [...(roster || [])]
    .sort((a, b) => a.start - b.start)
    .map(seg => {
      const names = (seg.names || []).join("、") || "未填";
      return `${String(seg.start).padStart(2, "0")}–${String(seg.end).padStart(2, "0")} · ${names}（${segDutyCount(seg)}人）`;
    })
    .join(" | ");
}

function formatDutyWeekSummary(cst) {
  const nc = normalizeCst(cst);
  return Array.from({ length: nc.workDays }, (_, d) => {
    const summary = formatDutyRosterSummary(getDutyRosterForDay(nc, d));
    return `${DAYS_ZH[d]}：${summary || "未配置"}`;
  }).join("\n");
}

// ══════════════════════════════════════════════════════════════════
//  Scheduler Core
// ══════════════════════════════════════════════════════════════════

// 检查时刻 t 是否落在某设备的故障窗口内,返回故障窗结束时刻 (无故障返回 null)
function inFailureWindow(eq, t, failures) {
  for (const f of (failures || [])) {
    if (f.eq === eq && t >= f.start && t < f.end) return f.end;
  }
  return null;
}

// 检查 [start, start+dur) 是否与故障窗口重叠
function overlapsFailure(eq, start, dur, failures) {
  const end = start + dur;
  for (const f of (failures || [])) {
    if (f.eq !== eq) continue;
    if (start < f.end && end > f.start) return f.end;
  }
  return null;
}

function nextWorkStart(t, cst) {
  for (let i = 0; i < 500; i++) {
    if (t >= cst.workDays * 24) return Infinity;
    const day = Math.floor(t / 24), h = t % 24;
    if (h < cst.shiftStart) { t = day * 24 + cst.shiftStart; continue; }
    if (h >= cst.shiftEnd)  { t = (day + 1) * 24 + cst.shiftStart; continue; }
    return t;
  }
  return Infinity;
}

function getDutyCapacityAt(t, cst) {
  const dayIdx = Math.floor(t / 24);
  const hour = t % 24;
  for (const seg of getDutyRosterForDay(cst, dayIdx)) {
    if (hour >= seg.start && hour < seg.end) return segDutyCount(seg);
  }
  return 0;
}

function countWorkersAt(workerTl, pt) {
  let sum = 0;
  for (const s of workerTl) {
    if (s.start <= pt && s.end > pt) sum += s.workers;
  }
  return sum;
}

function collectWorkerCheckPoints(workerTl, start, end, cst) {
  const points = new Set([start]);
  for (const s of workerTl) {
    if (s.end <= start || s.start >= end) continue;
    points.add(Math.max(s.start, start));
    if (s.end < end) points.add(s.end);
  }
  const startDay = Math.floor(start / 24);
  const endDay = Math.floor(Math.max(start, end - 1e-9) / 24);
  for (let d = startDay; d <= endDay + 1; d++) {
    for (const seg of getDutyRosterForDay(cst, d)) {
      const segStart = d * 24 + seg.start;
      const segEnd = d * 24 + seg.end;
      if (segStart >= start && segStart < end) points.add(segStart);
      if (segEnd > start && segEnd < end) points.add(segEnd);
    }
  }
  return [...points].filter(p => p >= start && p < end).sort((a, b) => a - b);
}

function workersFit(workerTl, start, dur, needed, cst) {
  const end = start + dur;
  const points = collectWorkerCheckPoints(workerTl, start, end, cst);
  const checkPts = points.length ? points : [start];
  for (const pt of checkPts) {
    if (countWorkersAt(workerTl, pt) + needed > getDutyCapacityAt(pt, cst)) return false;
  }
  return true;
}

function nextWorkerFreeTime(workerTl, t, dur, needed, cst) {
  const candidates = new Set();
  for (const s of workerTl) {
    if (s.end > t) candidates.add(s.end);
  }
  const day = Math.floor(t / 24);
  for (let d = day; d <= day + cst.workDays + 1; d++) {
    for (const seg of getDutyRosterForDay(cst, d)) {
      candidates.add(d * 24 + seg.start);
      candidates.add(d * 24 + seg.end);
    }
  }
  let best = Infinity;
  for (const c of candidates) {
    if (c <= t) continue;
    if (workersFit(workerTl, c, dur, needed, cst)) best = Math.min(best, c);
  }
  if (best !== Infinity) return best;
  const overlapping = workerTl.filter(s => s.start < t + dur && s.end > t);
  if (overlapping.length) return Math.min(...overlapping.map(s => s.end));
  return t + 0.5;
}

function findSlot(eq, tl, minStart, dur, cst, workerTl, workers, failures) {
  let t = nextWorkStart(minStart, cst);

  for (let iter = 0; iter < 50000; iter++) {
    if (t === Infinity) return Infinity;
    t = nextWorkStart(t, cst);
    if (t === Infinity) return Infinity;

    const dayBase = Math.floor(t / 24) * 24;
    const shiftEnd = dayBase + cst.shiftEnd;
    if (t + dur > shiftEnd) { t = nextWorkStart(shiftEnd, cst); continue; }

    // 设备故障窗口
    const failEnd = overlapsFailure(eq, t, dur, failures);
    if (failEnd != null) { t = nextWorkStart(failEnd, cst); continue; }

    // 设备时间线占用
    const clash = (tl || []).find(s => s.start < t + dur && s.end > t);
    if (clash) { t = nextWorkStart(clash.end, cst); continue; }

    // 人员（按值班表时段约束）
    if (!workersFit(workerTl, t, dur, workers, cst)) {
      t = nextWorkStart(nextWorkerFreeTime(workerTl, t, dur, workers, cst), cst);
      continue;
    }

    return t;
  }
  return Infinity;
}

/** 在同类型多台设备中选最早可行槽 */
function findBestSlot(eqType, tls, minStart, dur, cst, workerTl, workers, failures) {
  const instances = instancesForType(cst, eqType);
  let bestStart = Infinity;
  let bestEq = instances[0] || eqType;
  for (const inst of instances) {
    const start = findSlot(inst, tls[inst], minStart, dur, cst, workerTl, workers, failures);
    if (start < bestStart) {
      bestStart = start;
      bestEq = inst;
    }
  }
  return { start: bestStart, eq: bestEq };
}

/**
 * 主排产函数(支持动态重调度)
 * @param {Array}  plan       任务列表 [{id,typeId,batches,priority,note}]
 * @param {Array}  types      型号配置
 * @param {Object} cst        约束参数
 * @param {Object} [opts]     可选项
 * @param {Array}  [opts.frozenEvents]  冻结工序(已完成/进行中,不重排)
 * @param {Array}  [opts.failures]      设备故障窗口 [{eq,start,end,reason}]
 * @param {Number} [opts.minStart]      所有新工序最早开始时刻(默认 0)
 * @param {Object} [opts.batchProgress] 各批次工序进度 {batchKey: nextOpIdx}
 * @param {Number} [opts.consumedMatA/B/Release] 已消耗物料(从可用库存中扣除)
 */
function runSchedule(plan, types, cst, opts = {}) {
  cst = normalizeCst(cst);
  const {
    frozenEvents = [],
    failures = [],
    minStart = 0,
    batchProgress = {},   // { "ptId|wo": startOpIdx }
  } = opts;

  const tls = initEqTimelines(cst, frozenEvents);
  const workerTl = [];

  // 用冻结工序初始化人员时间线
  for (const e of frozenEvents) {
    if (e.workers > 0) workerTl.push({ start: e.start, end: e.end, workers: e.workers });
  }

  // 展开 plan → batches
  const batches = [];
  let woCnt = 1;
  for (const task of [...plan].sort((a, b) => a.priority - b.priority)) {
    const pt = types.find(t => t.id === task.typeId);
    if (!pt) continue;
    for (let b = 0; b < task.batches; b++) {
      // 支持自定义 wo (用于重排时保持工单号)
      const wo = task._woStart != null ? task._woStart + b : woCnt++;
      batches.push({ task, pt, batchNum: b + 1, wo });
    }
  }

  const events = [];

  for (const batch of batches) {
    const batchKey = `${batch.task.id}|${batch.batchNum}`;
    const startOpIdx = batchProgress[batchKey] || 0;

    // 该批次最后一个冻结工序的 endTime,作为下一道工序的 prevEnd
    let prevEnd = minStart;
    const woStr = `WO-${String(batch.wo).padStart(3, "0")}`;
    const frozenForBatch = frozenEvents.filter(e =>
      (e.taskId && e.taskId === batch.task.id && (e.batchNum ?? 1) === batch.batchNum)
      || (!e.taskId && e.ptId === batch.pt.id && e.wo === woStr)
    );
    if (frozenForBatch.length) {
      prevEnd = Math.max(prevEnd, ...frozenForBatch.map(e => e.end));
    }

    for (let i = startOpIdx; i < batch.pt.ops.length; i++) {
      const op = batch.pt.ops[i];
      const totalDur = op.dur + (op.cleanDur || 0) + (op.agv || 0);

      let minS = Math.max(prevEnd, minStart);

      const { start, eq: eqInst } = findBestSlot(op.eq, tls, minS, totalDur, cst, workerTl, op.workers, failures);
      const end   = start + totalDur;

      const extras = [op.cleanDur > 0 && `清洗${op.cleanDur}h`, op.agv > 0 && `AGV${op.agv}h`].filter(Boolean);
      const opLabel = op.name + (extras.length ? `(含${extras.join("+")})` : "");

      events.push({
        wo: `WO-${String(batch.wo).padStart(3, "0")}`,
        taskId: batch.task.id,
        batchLabel: `${batch.pt.code}-批${batch.batchNum}`,
        batchNum: batch.batchNum,
        ptId: batch.pt.id, ptCode: batch.pt.code, ptColor: batch.pt.color,
        opName: opLabel,
        opIdx: i,
        eq: eqInst, start, end, dur: totalDur, workers: op.workers,
        isCleaning: false,
        note: batch.task.note,
        isNew: true,        // 标记为重排产生(便于UI区分)
      });

      if (!tls[eqInst]) tls[eqInst] = [];
      tls[eqInst].push({ start, end });
      tls[eqInst].sort((a, b) => a.start - b.start);
      if (op.workers > 0) workerTl.push({ start, end, workers: op.workers });

      prevEnd = end;
    }
  }

  return events.sort((a, b) => a.start - b.start);
}

// ══════════════════════════════════════════════════════════════════
//  Reschedule (动态重调度)
// ══════════════════════════════════════════════════════════════════

/**
 * 根据当前时刻 + 新故障 + 新插单,产生新的排产
 * @param {Object} params
 *   - currentEvents   现有排产结果
 *   - plan            原 plan(已含可能的新插单任务)
 *   - types
 *   - cst
 *   - rescheduleAt    重调度基准时刻(小时,以周一00:00为原点)
 *   - failures        设备故障列表
 *   - newTasks        新插单任务列表(优先级用户自填)
 */
function eventBatchKey(e) {
  if (e.taskId) return `${e.taskId}|${e.batchNum ?? 1}`;
  return `${e.ptId}|${parseInt(e.wo.replace("WO-", ""), 10)}`;
}

function assignStableWoForReschedule(plan, currentEvents) {
  const taskWoMap = {};
  for (const e of currentEvents) {
    if (e.taskId && taskWoMap[e.taskId] === undefined) {
      taskWoMap[e.taskId] = parseInt(e.wo.replace("WO-", ""), 10);
    }
  }
  const ptBatchWo = {};
  for (const e of currentEvents) {
    if (e.taskId) continue;
    const key = `${e.ptId}|${e.batchNum ?? 1}`;
    if (ptBatchWo[key] === undefined) {
      ptBatchWo[key] = parseInt(e.wo.replace("WO-", ""), 10);
    }
  }
  const usedWos = new Set(
    currentEvents.map(e => parseInt(e.wo.replace("WO-", ""), 10))
  );
  let nextWo = (usedWos.size ? Math.max(...usedWos) : 0) + 1;
  const ptTypeAssignCount = {};

  return plan.map(task => {
    if (taskWoMap[task.id] !== undefined) {
      return { ...task, _woStart: taskWoMap[task.id] };
    }
    const fk = `${task.typeId}|1`;
    const n = ptTypeAssignCount[task.typeId] || 0;
    ptTypeAssignCount[task.typeId] = n + 1;
    if (task.batches === 1 && n === 0 && ptBatchWo[fk] !== undefined) {
      return { ...task, _woStart: ptBatchWo[fk] };
    }
    while (usedWos.has(nextWo)) nextWo++;
    const woStart = nextWo;
    for (let b = 0; b < task.batches; b++) usedWos.add(woStart + b);
    nextWo = woStart + task.batches;
    return { ...task, _woStart: woStart };
  });
}

function reschedule({ currentEvents, plan, types, cst, rescheduleAt, failures, newTasks }) {
  // 1. 分类已有工序
  const frozen = [];                     // 已完成 OR 进行中(且未被故障中断)
  const cancelled = [];                  // 进行中遇故障 → 强制中断作废
  const batchProgress = {};              // { "taskId|batchNum": nextOpIdx }
  const cancelledBatchKeys = new Set();

  for (const e of currentEvents) {
    const batchKey = eventBatchKey(e);

    if (e.end <= rescheduleAt) {
      // 已完成
      frozen.push(e);
      batchProgress[batchKey] = Math.max(batchProgress[batchKey] || 0, e.opIdx + 1);
    } else if (e.start <= rescheduleAt) {
      // 进行中:检查是否被故障打断
      const failEnd = overlapsFailure(e.eq, e.start, e.end - e.start, failures);
      if (failEnd != null && failEnd > rescheduleAt) {
        // 被故障中断 → 作废,从该工序重排
        cancelled.push(e);
        cancelledBatchKeys.add(batchKey);
        // batchProgress 保持指向该工序(opIdx),即从这道工序重排
        batchProgress[batchKey] = Math.min(
          batchProgress[batchKey] !== undefined ? batchProgress[batchKey] : Infinity,
          e.opIdx
        );
      } else {
        // 正常进行,允许其完成
        frozen.push(e);
        batchProgress[batchKey] = Math.max(batchProgress[batchKey] || 0, e.opIdx + 1);
      }
    } else {
      // 未开始 → 待重排
      // batchProgress 取该批次未冻结工序中最小 opIdx
      if (batchProgress[batchKey] === undefined || batchProgress[batchKey] > e.opIdx) {
        // 仅当尚未被冻结工序覆盖时才更新
      }
    }
  }

  // 校正 batchProgress: 对每个批次,确保 progress = max(已冻结工序的 opIdx) + 1
  // 已在上面 frozen 路径处理;cancelled 路径覆盖回中断工序。

  // 2. 标记冻结工序
  const frozenMarked = frozen.map(e => ({
    ...e, locked: true, isNew: false,
    status: e.end <= rescheduleAt ? 'DONE' : 'RUNNING',
  }));

  // 3. 构造重排用 plan（保留已有批次工单号，插单分配新工单号）
  const planForReschedule = assignStableWoForReschedule([
    ...plan.map(t => ({ ...t })),
    ...newTasks.map(t => ({ ...t, _isNew: true })),
  ], currentEvents);

  // 4. 调用 runSchedule 重排
  const newEvents = runSchedule(planForReschedule, types, cst, {
    frozenEvents: frozenMarked,
    failures,
    minStart: rescheduleAt,
    batchProgress,
  });

  // 5. 合并:冻结 + 新排
  const merged = [
    ...frozenMarked,
    ...newEvents.filter(e => !frozenMarked.some(f =>
      f.wo === e.wo && f.opIdx === e.opIdx
    )),
  ].sort((a, b) => a.start - b.start);

  return {
    events: merged,
    stats: {
      frozenCount: frozenMarked.length,
      cancelledCount: cancelled.length,
      newCount: newEvents.length,
    },
  };
}

// ══════════════════════════════════════════════════════════════════
//  Display Helpers
// ══════════════════════════════════════════════════════════════════

function fmtTime(t) {
  if (t == null || t === Infinity) return "—";
  const day = Math.floor(t / 24);
  const h   = t % 24;
  const hh  = Math.floor(h), mm = Math.round((h % 1) * 60);
  const label = day < DAYS_ZH.length ? DAYS_ZH[day] : `第${day + 1}天`;
  return `${label} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function fmtDur(h) {
  const hrs = Math.floor(h), mins = Math.round((h % 1) * 60);
  return mins ? `${hrs}h${mins}m` : `${hrs}h`;
}

/** HGNN+PPO 调优后默认参数 */
const DEFAULT_HGNN_PARAMS = {
  episodes: 300,
  lr: 0.0005,
  gamma: 0.99,
  epsClip: 0.2,
  entropyCoef: 0.02,
  d: 64,
};

function buildHgnnRequestBody(plan, types, cst, hgnnParams) {
  const hp = { ...DEFAULT_HGNN_PARAMS, ...hgnnParams };
  return {
    plan, types, cst,
    episodes: hp.episodes,
    hgnn: {
      episodes: hp.episodes,
      lr: hp.lr,
      gamma: hp.gamma,
      eps_clip: hp.epsClip,
      entropy_coef: hp.entropyCoef,
      d: hp.d,
    },
  };
}

/** 排产方案 KPI（用于算法对比） */
function computeScheduleMetrics(events, cst) {
  const nc = normalizeCst(cst);
  if (!events?.length) {
    return { makespan: 0, avgEqUtil: 0, capacityUtil: 0, totalLaborH: 0, totalCleanH: 0, opCount: 0, batchCount: 0 };
  }
  const makespan = events.reduce((mx, e) => Math.max(mx, e.end), 0);
  const instances = getEqInstances(nc);
  const shiftLen = nc.shiftEnd - nc.shiftStart;
  const calendarCap = instances.length * nc.workDays * shiftLen;
  let totalBusy = 0;
  const utils = instances.map(inst => {
    const busy = events.filter(e => e.eq === inst && !e.isCleaning).reduce((s, e) => s + e.dur, 0);
    totalBusy += busy;
    return makespan ? Math.round(busy / makespan * 100) : 0;
  }).filter((_, i) => events.some(e => e.eq === instances[i]));
  const avgEqUtil = utils.length ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length) : 0;
  const capacityUtil = calendarCap ? Math.round(totalBusy / calendarCap * 100) : 0;
  const totalLaborH = events.reduce((s, e) => s + e.dur * (e.workers || 0), 0);
  const totalCleanH = events.reduce((s, e) => {
    const m = String(e.opName || "").match(/清洗([\d.]+)h/);
    return s + (m ? parseFloat(m[1]) : 0);
  }, 0);
  return {
    makespan,
    avgEqUtil,
    capacityUtil,
    totalLaborH: Math.round(totalLaborH * 10) / 10,
    totalCleanH: Math.round(totalCleanH * 10) / 10,
    opCount: events.filter(e => !e.isCleaning).length,
    batchCount: new Set(events.map(e => e.wo)).size,
  };
}

function AlgoComparePanel({ compare, onAdopt, loading }) {
  if (!compare && !loading) return null;
  const rows = [
    { key: "makespan", label: "完工时长", fmt: v => fmtTime(v), better: "lower" },
    { key: "avgEqUtil", label: "设备平均利用率", fmt: v => `${v}%`, better: "higher" },
    { key: "capacityUtil", label: "产能利用率", fmt: v => `${v}%`, better: "higher" },
    { key: "totalCleanH", label: "清洗总时长", fmt: v => `${v}h`, better: "lower" },
    { key: "totalLaborH", label: "人工占用总时", fmt: v => `${v}h`, better: "lower" },
    { key: "opCount", label: "工序总数", fmt: v => `${v}道`, better: null },
  ];
  const pickBest = (key, better) => {
    if (!compare || !better) return null;
    const g = compare.greedy.metrics[key];
    const h = compare.hgnn.metrics[key];
    if (g === h) return null;
    return better === "lower" ? (g < h ? "greedy" : "hgnn") : (g > h ? "greedy" : "hgnn");
  };

  return (
    <Card style={{ padding: 14, marginBottom: 12, border: `1px solid ${C.accentBdr}`, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <SecHead icon="⚖️" style={{ margin: 0 }}>算法对比报表</SecHead>
        {compare && (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={() => onAdopt("greedy")}>采用启发式</Btn>
            <Btn onClick={() => onAdopt("hgnn-ppo")} style={{ background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" }}>
              采用 HGNN+PPO
            </Btn>
          </div>
        )}
      </div>
      {loading && (
        <div style={{ fontSize: 12, color: C.accent, padding: "8px 0" }}>⏳ 双算法求解中（启发式 + HGNN+PPO）…</div>
      )}
      {compare && (
        <>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 10 }}>
            同一计划 · HGNN episodes={compare.hgnnParams?.episodes ?? 300}
            {compare.hgnnParams?.lr != null && ` · lr=${compare.hgnnParams.lr}`}
          </div>
          <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["指标", "启发式算法", "HGNN+PPO"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: C.t3, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, fmt, better }) => {
                  const best = pickBest(key, better);
                  const cell = (side, val) => ({
                    padding: "8px 12px",
                    fontFamily: "monospace",
                    fontWeight: best === side ? 800 : 500,
                    color: best === side ? C.dn : C.t1,
                    background: best === side ? C.dnBg : C.surface,
                  });
                  return (
                    <tr key={key} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 12px", color: C.t2, fontWeight: 600 }}>{label}</td>
                      <td style={cell("greedy", compare.greedy.metrics[key])}>{fmt(compare.greedy.metrics[key])}</td>
                      <td style={cell("hgnn", compare.hgnn.metrics[key])}>{fmt(compare.hgnn.metrics[key])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.t3, marginTop: 8 }}>
            绿色高亮为该项较优 · 产能利用率 = 设备忙碌总时 /（设备台数 × 工作日 × 日班次时长）
          </div>
        </>
      )}
    </Card>
  );
}

// "周X HH:MM" 字符串 → 绝对小时
function parseTimeStr(s) {
  // 接受 "周一 09:30" 或 "1 09:30" 形式
  if (!s) return 0;
  const m = s.trim().match(/^(?:周([一二三四五六日])|(\d+))\s+(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const dayMap = {"一":0,"二":1,"三":2,"四":3,"五":4,"六":5,"日":6};
  const day = m[1] != null ? dayMap[m[1]] : (parseInt(m[2],10)-1);
  const hh = parseInt(m[3],10), mm = parseInt(m[4],10);
  return day * 24 + hh + mm/60;
}

// ══════════════════════════════════════════════════════════════════
//  Design System
// ══════════════════════════════════════════════════════════════════

const C = {
  bg:"#f1f5f9", surface:"#ffffff", border:"#e2e8f0", border2:"#cbd5e1",
  t0:"#0f172a", t1:"#334155", t2:"#64748b", t3:"#94a3b8",
  accent:"#2563eb", accentBg:"#eff6ff", accentBdr:"#bfdbfe",
  dn:"#059669", dnBg:"#ecfdf5", dnBdr:"#a7f3d0",
  warn:"#d97706", warnBg:"#fffbeb",
  danger:"#dc2626", dangerBg:"#fef2f2",
  sh:"0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)",
};

const Card = ({children, style={}}) => (
  <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,
    boxShadow:C.sh,...style}}>{children}</div>
);

const SecHead = ({color=C.t2,icon="",children,style={}}) => (
  <p style={{margin:"0 0 10px",fontSize:10,fontWeight:700,letterSpacing:"0.13em",
    textTransform:"uppercase",color,display:"flex",alignItems:"center",gap:5,...style}}>
    {icon&&<span>{icon}</span>}{children}
  </p>
);

const Badge = ({color,bg,children,style={}}) => (
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 8px",
    borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:"nowrap",
    background:bg||color+"18",color,border:`1px solid ${color}33`,
    marginRight:3,...style}}>{children}</span>
);

const Btn = ({onClick,disabled,primary,danger,children,style={}}) => (
  <button onClick={onClick} disabled={disabled}
    style={{padding:"6px 16px",borderRadius:7,
      border:`1px solid ${danger?C.danger:primary?C.accent:C.border2}`,
      cursor:disabled?"not-allowed":"pointer",fontSize:12,fontWeight:600,
      background:danger?`linear-gradient(135deg,${C.danger},#b91c1c)`
              :primary?`linear-gradient(135deg,${C.accent},#1d4ed8)`:C.surface,
      color:(primary||danger)?"white":C.t1,
      boxShadow:(primary||danger)?"0 1px 3px rgba(0,0,0,.15)":"none",
      opacity:disabled?0.5:1,...style}}>{children}</button>
);

const NumInput = ({value,onChange,min=0,max=99,step=0.5,unit="",style={}}) => (
  <div style={{display:"flex",alignItems:"center",gap:4}}>
    <input type="number" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(+e.target.value)}
      style={{width:64,padding:"4px 7px",borderRadius:5,border:`1px solid ${C.border2}`,
        background:C.surface,color:C.t0,fontSize:12,textAlign:"center",
        fontFamily:"monospace",outline:"none",...style}}/>
    {unit&&<span style={{fontSize:11,color:C.t3}}>{unit}</span>}
  </div>
);

const DutyNameEditor = ({ names = [], onChange, max = 20 }) => {
  const [draft, setDraft] = useState("");
  const addName = () => {
    const n = draft.trim();
    if (!n || names.includes(n) || names.length >= max) return;
    onChange([...names, n]);
    setDraft("");
  };
  return (
    <div style={{minWidth:160}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:names.length?6:0}}>
        {names.map((name, i) => (
          <span key={`${name}-${i}`} style={{display:"inline-flex",alignItems:"center",gap:4,
            padding:"3px 8px",borderRadius:6,background:C.accentBg,
            border:`1px solid ${C.accentBdr}`,fontSize:11,color:C.accent,fontWeight:600}}>
            {name}
            <button type="button" onClick={()=>onChange(names.filter((_, j) => j !== i))}
              style={{border:"none",background:"transparent",color:C.danger,cursor:"pointer",
                fontSize:12,lineHeight:1,padding:0}}>×</button>
          </span>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input value={draft} placeholder="输入姓名"
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); addName(); } }}
          style={{flex:1,minWidth:72,padding:"4px 8px",borderRadius:5,
            border:`1px solid ${C.border2}`,fontSize:11,outline:"none"}}/>
        <button type="button" onClick={addName} disabled={!draft.trim() || names.length >= max}
          style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.border2}`,
            background:C.surface,cursor:"pointer",fontSize:11,color:C.accent,fontWeight:600}}>＋</button>
        <span style={{fontSize:10,color:C.t3,whiteSpace:"nowrap"}}>共{names.length}人</span>
      </div>
    </div>
  );
};

const Stepper = ({value,onChange,min=1,max=10,color=C.t0}) => (
  <div style={{display:"flex",alignItems:"center",gap:4}}>
    <button onClick={()=>onChange(Math.max(min,value-1))}
      style={{width:22,height:22,borderRadius:4,border:`1px solid ${C.border2}`,
        cursor:"pointer",background:C.surface,color:C.t2,fontSize:14,padding:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
    <span style={{fontSize:14,fontWeight:700,color,fontFamily:"monospace",
      minWidth:26,textAlign:"center"}}>{value}</span>
    <button onClick={()=>onChange(Math.min(max,value+1))}
      style={{width:22,height:22,borderRadius:4,border:`1px solid ${C.border2}`,
        cursor:"pointer",background:C.surface,color:C.t2,fontSize:14,padding:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
  </div>
);

// ══════════════════════════════════════════════════════════════════
//  Gantt Chart
// ══════════════════════════════════════════════════════════════════

function GanttChart({events, cst, rescheduleAt, failures}) {
  if (!events.length) return (
    <div style={{textAlign:"center",padding:60,color:C.t3}}>
      <div style={{fontSize:44,marginBottom:12}}>📊</div>
      <p style={{fontSize:14,color:C.t2}}>请先点击「生成排产」</p>
    </div>
  );

  const shiftLen = cst.shiftEnd - cst.shiftStart;
  const maxT = events.reduce((mx,e)=>Math.max(mx,e.end),0);
  const totalDays = Math.min(cst.workDays, Math.ceil(maxT/24)+1);

  const toX = t => {
    const day = Math.floor(t/24);
    const h   = t%24;
    const dh  = Math.max(0, Math.min(h, cst.shiftEnd) - cst.shiftStart);
    return day * shiftLen + dh;
  };

  const activeEqs = events.length > 0
    ? getEqInstances(cst)
    : getEqInstances(cst).filter(inst =>
        events.some(e => e.eq === inst) || (failures || []).some(f => f.eq === inst)
      );
  const PX=44, ROW=42, LBL=96, HDR=46, PAD=12;
  const W = LBL + totalDays*shiftLen*PX + PAD;
  const H = HDR + activeEqs.length*ROW + 4;

  return (
    <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
      <svg width={W} height={H} style={{display:"block"}}>
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc"/>

        {/* Day bands + headers */}
        {Array.from({length:totalDays},(_,d)=>(
          <g key={d}>
            <rect x={LBL+d*shiftLen*PX} y={0} width={shiftLen*PX} height={H}
              fill={d%2===0?"#f8fafc":"#f1f5f9"}/>
            <line x1={LBL+d*shiftLen*PX} y1={0} x2={LBL+d*shiftLen*PX} y2={H}
              stroke="#cbd5e1" strokeWidth={1.5}/>
            <text x={LBL+(d+0.5)*shiftLen*PX} y={15} textAnchor="middle"
              fontSize={11} fontWeight="700" fill={C.t1} fontFamily="sans-serif">
              {DAYS_ZH[d]||`D${d+1}`}
            </text>
          </g>
        ))}

        {Array.from({length:totalDays},(_,d)=>
          Array.from({length:shiftLen+1},(_,h)=>(
            <g key={`${d}-${h}`}>
              <line x1={LBL+(d*shiftLen+h)*PX} y1={28} x2={LBL+(d*shiftLen+h)*PX} y2={H}
                stroke={h===0?"#94a3b8":"#e2e8f0"} strokeWidth={1}/>
              {h<shiftLen&&(
                <text x={LBL+(d*shiftLen+h)*PX+2} y={26}
                  fontSize={8} fill={C.t3} fontFamily="monospace">
                  {String(cst.shiftStart+h).padStart(2,"0")}
                </text>
              )}
            </g>
          ))
        )}

        <line x1={0} y1={HDR} x2={W} y2={HDR} stroke="#cbd5e1" strokeWidth={1.5}/>

        {/* 重调度基准时刻 红色竖线 */}
        {rescheduleAt != null && rescheduleAt < totalDays * 24 && (
          <g>
            <line x1={LBL + toX(rescheduleAt)*PX} y1={HDR}
                  x2={LBL + toX(rescheduleAt)*PX} y2={H}
                  stroke={C.danger} strokeWidth={1.5} strokeDasharray="4,3"/>
            <rect x={LBL + toX(rescheduleAt)*PX - 22} y={HDR - 14}
                  width={44} height={13} rx={3} fill={C.danger}/>
            <text x={LBL + toX(rescheduleAt)*PX} y={HDR - 4} textAnchor="middle"
                  fontSize={9} fontWeight="700" fill="white">NOW</text>
          </g>
        )}

        {/* Equipment rows */}
        {activeEqs.map((eq,ri)=>{
          const y = HDR + ri*ROW;
          return (
            <g key={eq}>
              {ri>0&&<line x1={0} y1={y} x2={W} y2={y} stroke="#f1f5f9" strokeWidth={1}/>}
              <rect x={0} y={y} width={LBL} height={ROW} fill="#f8fafc"/>
              <line x1={LBL} y1={y} x2={LBL} y2={y+ROW} stroke="#e2e8f0" strokeWidth={1}/>
              <text x={LBL-8} y={y+ROW/2+4} textAnchor="end"
                fontSize={11} fontWeight="600" fill={C.t1} fontFamily="sans-serif">{eq}</text>

              {/* 故障窗口背景 */}
              {(failures||[]).filter(f=>f.eq===eq).map((f,fi)=>{
                const fx1 = LBL + toX(f.start)*PX;
                const fx2 = LBL + toX(f.end)*PX;
                return (
                  <g key={`f${fi}`}>
                    <rect x={fx1} y={y+2} width={Math.max(fx2-fx1,2)} height={ROW-4}
                      fill="url(#failurePattern)" opacity={0.7}/>
                    <rect x={fx1} y={y+2} width={Math.max(fx2-fx1,2)} height={ROW-4}
                      fill="none" stroke={C.danger} strokeWidth={1} strokeDasharray="3,2"/>
                  </g>
                );
              })}

              {events.filter(e=>e.eq===eq).map((evt,ei)=>{
                const x1 = LBL + toX(evt.start)*PX;
                const x2 = LBL + toX(evt.end)*PX;
                const bw = Math.max(x2-x1-2, 2);
                const col = evt.isCleaning ? CLEAN_COL : evt.ptColor;
                const isLocked = evt.locked;
                const alpha = evt.isCleaning ? 0.35 : isLocked ? 0.45 : 0.92;
                return (
                  <g key={ei}>
                    <rect x={x1+1} y={y+5} width={bw} height={ROW-10}
                      fill={col} opacity={alpha} rx={3}
                      stroke={isLocked ? "#475569" : (evt.isNew ? "#fbbf24" : "none")}
                      strokeWidth={isLocked || evt.isNew ? 1.5 : 0}
                      strokeDasharray={isLocked ? "0" : evt.isNew ? "2,1" : "0"}/>
                    {bw>28&&(
                      <text x={x1+bw/2+1} y={y+ROW/2+2} textAnchor="middle"
                        fontSize={9} fontWeight="700" fontFamily="sans-serif"
                        fill={evt.isCleaning?C.t2:"white"}>
                        {isLocked && "🔒"}{evt.isCleaning?"🧹清洗":evt.opName}
                      </text>
                    )}
                    {bw>50&&!evt.isCleaning&&(
                      <text x={x1+bw/2+1} y={y+ROW/2+12} textAnchor="middle"
                        fontSize={8} fontFamily="sans-serif"
                        fill="rgba(255,255,255,0.85)">
                        {evt.batchLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        <defs>
          <pattern id="failurePattern" patternUnits="userSpaceOnUse" width={6} height={6}>
            <rect width={6} height={6} fill="#fee2e2"/>
            <line x1={0} y1={6} x2={6} y2={0} stroke={C.danger} strokeWidth={1}/>
          </pattern>
        </defs>
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Work Order Table
// ══════════════════════════════════════════════════════════════════

function WorkOrderTable({events}) {
  if (!events.length) return (
    <div style={{textAlign:"center",padding:60,color:C.t3}}>
      <p style={{fontSize:14,color:C.t2}}>请先生成排产方案</p>
    </div>
  );

  return (
    <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:"#f8fafc"}}>
            {["状态","工单号","批次","工序","设备","计划开始","计划完成","工时","人员","备注"].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:10,fontWeight:700,
                textTransform:"uppercase",color:C.t3,borderBottom:`1px solid ${C.border}`,
                whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e,i)=>{
            const isCl = e.isCleaning;
            const status = e.locked
              ? (e.status === 'DONE' ? {l:"已完成",c:C.t3,bg:"#f1f5f9"} : {l:"进行中",c:C.warn,bg:"#fef3c7"})
              : e.isNew ? {l:"新排",c:C.dn,bg:"#dcfce7"} : {l:"待排",c:C.accent,bg:C.accentBg};
            return (
              <tr key={i} style={{background:isCl?"#f8fafc":i%2===0?C.surface:"#fafafa",
                borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:"7px 10px"}}>
                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,
                    background:status.bg,color:status.c,fontWeight:700}}>
                    {status.l}
                  </span>
                </td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.t3,fontSize:11}}>
                  {e.wo}
                </td>
                <td style={{padding:"7px 10px"}}>
                  {!isCl&&<Badge color={e.ptColor}>{e.batchLabel}</Badge>}
                  {isCl&&<span style={{fontSize:11,color:C.t3}}>{e.batchLabel}</span>}
                </td>
                <td style={{padding:"7px 10px"}}>
                  <span style={{fontWeight:isCl?400:600,color:isCl?C.t3:C.t0,
                    display:"flex",alignItems:"center",gap:4}}>
                    {isCl&&<span style={{fontSize:12}}>🧹</span>}
                    {e.opName}
                  </span>
                </td>
                <td style={{padding:"7px 10px",color:C.t1}}>{e.eq}</td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.accent,fontSize:11}}>
                  {fmtTime(e.start)}
                </td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.accent,fontSize:11}}>
                  {fmtTime(e.end)}
                </td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.t1}}>
                  {fmtDur(e.dur)}
                </td>
                <td style={{padding:"7px 10px",color:C.t1}}>
                  {e.workers}人
                </td>
                <td style={{padding:"7px 10px",color:C.t3,fontSize:11}}>
                  {e.note||"—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Reschedule Modal (动态重排)
// ══════════════════════════════════════════════════════════════════

function RescheduleModal({open, onClose, onConfirm, types, currentEvents, currentMakespan, cst}) {
  const [rescheduleAtStr, setRescheduleAtStr] = useState("");
  const [failures, setFailures] = useState([]);
  const [newTasks, setNewTasks] = useState([]);

  // 打开时,默认 now (按 currentEvents 中存在的最早未完成工序起点 OR 0)
  useEffect(()=>{
    if (open) {
      // 默认设为"现在":取最早未完成工序的 start,若全部完成则取 makespan/2
      const upcoming = currentEvents.filter(e => !e.locked).map(e=>e.start);
      const def = upcoming.length ? Math.min(...upcoming) : 0;
      setRescheduleAtStr(fmtTime(def));
      setFailures([]);
      setNewTasks([]);
    }
  }, [open]);

  if (!open) return null;

  const rescheduleAt = parseTimeStr(rescheduleAtStr);
  const validTime = rescheduleAt != null;

  // 影响预估
  let frozenCnt = 0, runningCnt = 0, pendingCnt = 0, cancelledCnt = 0;
  if (validTime) {
    for (const e of currentEvents) {
      if (e.end <= rescheduleAt) frozenCnt++;
      else if (e.start <= rescheduleAt) {
        const failEnd = overlapsFailure(e.eq, e.start, e.end - e.start, failures);
        if (failEnd != null && failEnd > rescheduleAt) cancelledCnt++;
        else runningCnt++;
      } else pendingCnt++;
    }
  }

  const addFailure = () => {
    setFailures(p=>[...p, {id:uid(), eq:getEqInstances(cst)[2]||"混合锅", startStr:fmtTime(rescheduleAt||0), endStr:fmtTime((rescheduleAt||0)+4), reason:"设备故障"}]);
  };
  const updFailure = (id,k,v) => setFailures(p=>p.map(f=>f.id===id?{...f,[k]:v}:f));
  const delFailure = id => setFailures(p=>p.filter(f=>f.id!==id));

  const addNewTask = () => {
    if (!types.length) return;
    setNewTasks(p=>[...p,{id:uid(),typeId:types[0].id,batches:1,priority:0,note:"插单"}]);
  };
  const updNewTask = (id,k,v) => setNewTasks(p=>p.map(t=>t.id===id?{...t,[k]:v}:t));
  const delNewTask = id => setNewTasks(p=>p.filter(t=>t.id!==id));

  const handleConfirm = () => {
    if (!validTime) { alert("请输入合法的时间格式,例如:周一 09:30"); return; }

    // 转换 failures 时间字符串为绝对小时
    const failuresParsed = failures.map(f=>({
      eq: f.eq,
      start: parseTimeStr(f.startStr),
      end:   parseTimeStr(f.endStr),
      reason: f.reason,
    })).filter(f=>f.start!=null && f.end!=null && f.end > f.start);

    if (failures.length && failuresParsed.length !== failures.length) {
      alert("故障窗口时间格式有误,请检查");
      return;
    }

    onConfirm({
      rescheduleAt,
      failures: failuresParsed,
      newTasks: newTasks.map(({id,...rest})=>({...rest, id:uid()})),
    });
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:C.surface,borderRadius:12,maxWidth:780,width:"100%",
          maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 50px rgba(0,0,0,.3)"}}>

        <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.t0}}>🔄 动态重调度</div>
            <div style={{fontSize:11,color:C.t3,marginTop:2}}>
              冻结已完成/进行中工序 · 根据当前环境重排剩余工序
            </div>
          </div>
          <button onClick={onClose} style={{padding:"4px 10px",borderRadius:6,
            border:`1px solid ${C.border2}`,background:C.surface,cursor:"pointer",
            color:C.t2,fontSize:18,lineHeight:1}}>✕</button>
        </div>

        <div style={{padding:"18px 22px"}}>

          {/* 重调度基准时刻 */}
          <div style={{marginBottom:18}}>
            <SecHead icon="⏰">重调度基准时刻 (NOW)</SecHead>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input value={rescheduleAtStr}
                onChange={e=>setRescheduleAtStr(e.target.value)}
                placeholder="例:周二 14:30"
                style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border2}`,
                  fontSize:13,fontFamily:"monospace",width:160,outline:"none",
                  background:validTime?C.surface:"#fef2f2"}}/>
              <span style={{fontSize:11,color:C.t3}}>
                格式:周X HH:MM &nbsp;|&nbsp; 当前完工:{fmtTime(currentMakespan)}
              </span>
              <Btn onClick={()=>{
                const upcoming = currentEvents.filter(e => !e.locked).map(e=>e.start);
                const def = upcoming.length ? Math.min(...upcoming) : 0;
                setRescheduleAtStr(fmtTime(def));
              }}>↻ 重置</Btn>
            </div>
          </div>

          {/* 设备故障 */}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <SecHead icon="⚠️" color={C.danger} style={{margin:0}}>设备故障窗口</SecHead>
              <Btn onClick={addFailure}>＋ 添加故障</Btn>
            </div>
            {failures.length===0 && (
              <div style={{padding:"10px 14px",fontSize:11,color:C.t3,
                background:"#f8fafc",borderRadius:6,border:`1px dashed ${C.border}`}}>
                暂无故障 — 如有设备宕机,点击「+ 添加故障」录入故障窗口
              </div>
            )}
            {failures.map(f=>(
              <div key={f.id} style={{display:"flex",gap:6,alignItems:"center",
                padding:"8px 10px",marginBottom:6,borderRadius:6,
                background:C.dangerBg,border:`1px solid #fecaca`}}>
                <select value={f.eq} onChange={e=>updFailure(f.id,"eq",e.target.value)}
                  style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border2}`,
                    fontSize:11,outline:"none"}}>
                  {getEqInstances(cst).map(eq=><option key={eq} value={eq}>{eq}</option>)}
                </select>
                <span style={{fontSize:10,color:C.t2}}>从</span>
                <input value={f.startStr}
                  onChange={e=>updFailure(f.id,"startStr",e.target.value)}
                  placeholder="周X HH:MM"
                  style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border2}`,
                    fontSize:11,fontFamily:"monospace",width:110,outline:"none"}}/>
                <span style={{fontSize:10,color:C.t2}}>至</span>
                <input value={f.endStr}
                  onChange={e=>updFailure(f.id,"endStr",e.target.value)}
                  placeholder="周X HH:MM"
                  style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border2}`,
                    fontSize:11,fontFamily:"monospace",width:110,outline:"none"}}/>
                <input value={f.reason}
                  onChange={e=>updFailure(f.id,"reason",e.target.value)}
                  placeholder="原因"
                  style={{flex:1,padding:"3px 6px",borderRadius:5,
                    border:`1px solid ${C.border2}`,fontSize:11,outline:"none"}}/>
                <button onClick={()=>delFailure(f.id)}
                  style={{padding:"2px 7px",borderRadius:4,border:"1px solid #fca5a5",
                    cursor:"pointer",background:"white",color:C.danger,fontSize:11}}>✕</button>
              </div>
            ))}
          </div>

          {/* 新插单 */}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <SecHead icon="🆕" color={C.dn} style={{margin:0}}>新增插单任务</SecHead>
              <Btn onClick={addNewTask}>＋ 新增插单</Btn>
            </div>
            {newTasks.length===0 && (
              <div style={{padding:"10px 14px",fontSize:11,color:C.t3,
                background:"#f8fafc",borderRadius:6,border:`1px dashed ${C.border}`}}>
                暂无插单 — 如有紧急任务,点击「+ 新增插单」并设置优先级(0=最高)
              </div>
            )}
            {newTasks.map(t=>{
              const pt = types.find(x=>x.id===t.typeId);
              return (
                <div key={t.id} style={{display:"flex",gap:8,alignItems:"center",
                  padding:"8px 10px",marginBottom:6,borderRadius:6,
                  background:C.dnBg,border:`1px solid ${C.dnBdr}`}}>
                  <span style={{fontSize:10,color:C.t2}}>优先级</span>
                  <input type="number" min={0} max={99} value={t.priority}
                    onChange={e=>updNewTask(t.id,"priority",+e.target.value)}
                    style={{width:50,padding:"3px 6px",borderRadius:5,
                      border:`1px solid ${C.border2}`,fontSize:11,
                      fontFamily:"monospace",textAlign:"center",outline:"none"}}/>
                  <span style={{fontSize:10,color:C.t2}}>型号</span>
                  <select value={t.typeId} onChange={e=>updNewTask(t.id,"typeId",e.target.value)}
                    style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border2}`,
                      fontSize:11,outline:"none"}}>
                    {types.map(x=><option key={x.id} value={x.id}>{x.code}</option>)}
                  </select>
                  {pt&&<div style={{width:8,height:8,borderRadius:2,background:pt.color}}/>}
                  <span style={{fontSize:10,color:C.t2}}>批次</span>
                  <Stepper value={t.batches} min={1} max={20}
                    onChange={v=>updNewTask(t.id,"batches",v)} color={pt?.color||C.t0}/>
                  <input value={t.note}
                    onChange={e=>updNewTask(t.id,"note",e.target.value)}
                    placeholder="备注"
                    style={{flex:1,padding:"3px 6px",borderRadius:5,
                      border:`1px solid ${C.border2}`,fontSize:11,outline:"none"}}/>
                  <button onClick={()=>delNewTask(t.id)}
                    style={{padding:"2px 7px",borderRadius:4,border:"1px solid #fca5a5",
                      cursor:"pointer",background:"white",color:C.danger,fontSize:11}}>✕</button>
                </div>
              );
            })}
          </div>

          {/* 影响预估 */}
          <div style={{padding:"12px 14px",borderRadius:8,background:C.accentBg,
            border:`1px solid ${C.accentBdr}`,marginBottom:14}}>
            <SecHead color={C.accent} icon="📊" style={{margin:"0 0 8px"}}>影响预估</SecHead>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {[
                ["已完成(冻结)",frozenCnt,C.t3],
                ["进行中(冻结)",runningCnt,C.warn],
                ["待重排",pendingCnt,C.accent],
                ["故障作废",cancelledCnt,C.danger],
              ].map(([l,v,c])=>(
                <div key={l} style={{textAlign:"center",padding:"6px",
                  background:C.surface,borderRadius:5}}>
                  <div style={{fontSize:10,color:C.t3}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{padding:"12px 22px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8,background:"#f8fafc"}}>
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary onClick={handleConfirm} disabled={!validTime}>
            🔄 执行重排
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  App
// ══════════════════════════════════════════════════════════════════

export default function App() {
  const [types,  setTypes]  = useState(DEFAULT_TYPES);
  const [plan,   setPlan]   = useState(DEFAULT_PLAN);
  const [cst,    setCst]    = useState(() => normalizeCst(DEFAULT_CST));
  const [events, setEvents] = useState([]);
  const [tab,    setTab]    = useState("plan");
  const [view,   setView]   = useState("gantt");
  const [algo,   setAlgo]   = useState("greedy");
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [algoCompare, setAlgoCompare] = useState(null);
  const [hgnnParams, setHgnnParams] = useState({ ...DEFAULT_HGNN_PARAMS });
  const [hgnnAdvancedOpen, setHgnnAdvancedOpen] = useState(false);
  const [openType, setOpenType] = useState({pt1:true});
  const [dutyDayTab, setDutyDayTab] = useState(0);

  // ── 重调度状态 ─────────────────────────────────────────────────
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAt, setRescheduleAt]     = useState(null);   // 上次重排基准时刻
  const [failures, setFailures]             = useState([]);     // 已生效的故障窗口
  const [reschedHistory, setReschedHistory] = useState([]);     // 重排历史记录

  const typeMap = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t])),[types]);

  const validateBeforeSchedule = () => {
    let needA = 0, needB = 0, needR = 0;
    for (const task of plan) {
      const pt = typeMap[task.typeId];
      if (!pt) continue;
      for (const op of pt.ops) {
        needA += (op.matA || 0) * task.batches;
        needB += (op.matB || 0) * task.batches;
        needR += (op.release || 0) * task.batches;
      }
    }
    const shortage = [];
    if (needA > cst.stockMatA) shortage.push(`原料A（需${needA}，库存${cst.stockMatA}）`);
    if (needB > cst.stockMatB) shortage.push(`原料B（需${needB}，库存${cst.stockMatB}）`);
    if (needR > cst.stockRelease) shortage.push(`脱模剂（需${needR}，库存${cst.stockRelease}）`);
    if (shortage.length) {
      alert("物料不足！\n" + shortage.join("\n"));
      return false;
    }
    const dutyErrors = validateDutyRoster(normalizeCst(cst));
    if (dutyErrors.length) {
      alert("值班表配置有误，请补全后再排产：\n" + dutyErrors.join("\n"));
      setTab("cst");
      return false;
    }
    return true;
  };

  const fetchHgnnSchedule = async (body) => {
    const resp = await fetch("/api/schedule/hgnn-ppo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`服务端错误: ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const generate = async () => {
    if (!validateBeforeSchedule()) return;

    if (algo === "greedy") {
      const result = runSchedule(plan, types, cst);
      setEvents(result);
      setAlgoCompare(null);
      setRescheduleAt(null);
      setFailures([]);
      setReschedHistory([]);
      setTab("result");
      setView("gantt");
    } else {
      setLoading(true);
      try {
        const data = await fetchHgnnSchedule(buildHgnnRequestBody(plan, types, cst, hgnnParams));
        setEvents(data.events || []);
        setAlgoCompare(null);
        setRescheduleAt(null);
        setFailures([]);
        setReschedHistory([]);
        setTab("result");
        setView("gantt");
      } catch (e) {
        alert("HGNN+PPO 调度失败，请确保后端服务已启动 (python server.py)\n\n" + e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const runAlgoCompare = async () => {
    if (!validateBeforeSchedule()) return;
    setCompareLoading(true);
    setAlgoCompare(null);
    setTab("result");
    try {
      const greedyEvents = runSchedule(plan, types, cst);
      const body = buildHgnnRequestBody(plan, types, cst, hgnnParams);
      const data = await fetchHgnnSchedule(body);
      const hgnnEvents = data.events || [];
      setAlgoCompare({
        greedy: { events: greedyEvents, metrics: computeScheduleMetrics(greedyEvents, cst) },
        hgnn: { events: hgnnEvents, metrics: computeScheduleMetrics(hgnnEvents, cst) },
        hgnnParams: data.hgnnParams || body.hgnn,
      });
    } catch (e) {
      alert("算法对比失败：\n" + e.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const adoptCompareResult = (which) => {
    if (!algoCompare) return;
    const picked = which === "greedy" ? algoCompare.greedy : algoCompare.hgnn;
    setEvents(picked.events);
    setAlgo(which);
    setRescheduleAt(null);
    setFailures([]);
    setReschedHistory([]);
    setView("gantt");
  };

  const updHgnnParam = (key, val) => {
    setHgnnParams(p => ({ ...p, [key]: val }));
    setEvents([]);
    setAlgoCompare(null);
  };

  // ── 重调度执行 ─────────────────────────────────────────────────
  const handleReschedule = async ({rescheduleAt: t, failures: newFailures, newTasks}) => {
    const allFailures = [...failures, ...newFailures];
    const planWithNew = [...plan, ...newTasks];

    const applyRescheduleResult = (merged, stats) => {
      setPlan(planWithNew);
      setEvents(merged);
      setRescheduleAt(t);
      setFailures(allFailures);
      setReschedHistory(p=>[...p, {
        at: t, time: new Date().toLocaleString("zh-CN"),
        failuresAdded: newFailures.length,
        newTasksAdded: newTasks.length,
        stats,
      }]);
      setRescheduleOpen(false);
      setTab("result");
      setView("gantt");
    };

    if (algo === "hgnn-ppo") {
      setLoading(true);
      try {
        const resp = await fetch("/api/schedule/hgnn-ppo/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildHgnnRequestBody(planWithNew, types, cst, hgnnParams),
            currentEvents: events,
            rescheduleAt: t,
            failures: allFailures,
          }),
        });
        if (!resp.ok) throw new Error(`服务端错误: ${resp.status}`);
        const data = await resp.json();
        if (data.error) { alert("HGNN+PPO 动态重排失败: " + data.error); return; }
        applyRescheduleResult(data.events || [], data.stats || {});
      } catch (e) {
        alert("HGNN+PPO 动态重排失败，请确保后端服务已启动 (python server.py)\n\n" + e.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    const { events: merged, stats } = reschedule({
      currentEvents: events,
      plan: planWithNew,
      types, cst,
      rescheduleAt: t,
      failures: allFailures,
      newTasks: [],
    });
    applyRescheduleResult(merged, stats);
  };

  // Stats
  const makespan   = useMemo(()=>events.reduce((mx,e)=>Math.max(mx,e.end),0),[events]);
  const batchCount = useMemo(()=>new Set(events.map(e=>e.wo)).size,[events]);
  const opCount    = useMemo(()=>events.filter(e=>!e.isCleaning).length,[events]);
  const eqUtil     = useMemo(()=>{
    if (!makespan) return {};
    const instances = getEqInstances(cst);
    return Object.fromEntries(instances.map(inst=>{
      const busy = events.filter(e=>e.eq===inst&&!e.isCleaning)
        .reduce((s,e)=>s+e.dur,0);
      return [inst, Math.round(busy/makespan*100)];
    }));
  },[events,makespan,cst]);

  const planBatches  = plan.reduce((s,t)=>s+t.batches,0);

  // ── 导出 PDF ──────────────────────────────────────────────────
  const exportPDF = () => {
    const algoLabel = algo === "greedy" ? "启发式算法" : "HGNN+PPO 智能调度";
    const utilItems = getEqInstances(cst).filter(inst => events.some(e => e.eq === inst))
      .map(inst => `<span>${inst}: <b>${eqUtil[inst] || 0}%</b></span>`).join("  ");

    const rows = events.map((e, i) =>
      `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td>${e.locked?(e.status==='DONE'?'✅已完成':'⏵进行中'):e.isNew?'🆕新排':'待排'}</td>
        <td>${e.wo}</td><td>${e.batchLabel}</td><td>${e.opName}</td>
        <td>${e.eq}</td><td>${fmtTime(e.start)}</td><td>${fmtTime(e.end)}</td>
        <td>${fmtDur(e.dur)}</td><td>${e.workers}人</td><td>${e.note || "—"}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>排产工单</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
             color:#1e293b;padding:20px 30px;font-size:12px}
        h1{font-size:18px;text-align:center;margin-bottom:4px}
        .sub{text-align:center;color:#94a3b8;font-size:11px;margin-bottom:16px}
        .kpi{display:flex;justify-content:space-around;margin-bottom:12px;
             padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
        .kpi-item{text-align:center}
        .kpi-item .label{font-size:10px;color:#94a3b8;margin-bottom:2px}
        .kpi-item .val{font-size:15px;font-weight:800;font-family:monospace}
        .util{font-size:11px;color:#64748b;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#2563eb;color:#fff;font-size:10px;font-weight:700;
           text-transform:uppercase;padding:6px 8px;text-align:left}
        td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
        @media print{
          body{padding:10px 15px}
          @page{size:A4 landscape;margin:10mm}
        }
      </style>
    </head><body>
      <h1>一号线排产工单</h1>
      <div class="sub">${new Date().toLocaleString("zh-CN")}  ·  ${algoLabel}${rescheduleAt!=null?`  ·  动态重排@${fmtTime(rescheduleAt)}`:''}</div>
      <div class="kpi">
        <div class="kpi-item"><div class="label">完工时间</div><div class="val">${fmtTime(makespan)}</div></div>
        <div class="kpi-item"><div class="label">批次总数</div><div class="val">${batchCount} 批</div></div>
        <div class="kpi-item"><div class="label">工序总数</div><div class="val">${opCount} 道</div></div>
        <div class="kpi-item"><div class="label">每日工时</div><div class="val">${cst.shiftEnd - cst.shiftStart}h/天</div></div>
      </div>
      <div class="util">设备利用率: ${utilItems}</div>
      <table>
        <thead><tr>
          <th>状态</th><th>工单号</th><th>批次</th><th>工序</th><th>设备</th>
          <th>计划开始</th><th>计划完成</th><th>工时</th><th>人员</th><th>备注</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Mutations ──────────────────────────────────────────────────
  const addType = () => {
    const n = {
      id:uid(), code:`型号${types.length+1}`, color:PALETTE[types.length%PALETTE.length],
      ops:[
        {id:uid(),name:"称量",    eq:"称量台", dur:0.5,workers:1, cleanDur:0, agv:0, matA:25, matB:10, release:0},
        {id:uid(),name:"预混",    eq:"搅拌机", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
        {id:uid(),name:"混合",    eq:"混合锅", dur:3.0,workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
        {id:uid(),name:"模具装配",eq:"成型台", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0.2},
        {id:uid(),name:"成型",    eq:"成型台", dur:4.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
        {id:uid(),name:"整装",    eq:"整装区", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
      ],
    };
    setTypes(p=>[...p,n]);
    setOpenType(p=>({...p,[n.id]:true}));
    setEvents([]);
  };

  const delType  = id => { setTypes(p=>p.filter(t=>t.id!==id)); setEvents([]); };
  const updType  = (id,k,v) => { setTypes(p=>p.map(t=>t.id===id?{...t,[k]:v}:t)); setEvents([]); };
  const updOp    = (tid,oid,k,v) => {
    setTypes(p=>p.map(t=>t.id!==tid?t:{...t,ops:t.ops.map(o=>o.id!==oid?o:{...o,[k]:v})}));
    setEvents([]);
  };

  const addTask  = () => {
    if (!types.length) return;
    const usedIds = plan.map(p=>p.typeId);
    const avail   = types.find(t=>!usedIds.includes(t.id)) || types[0];
    setPlan(p=>[...p,{id:uid(),typeId:avail.id,batches:1,priority:p.length+1,note:""}]);
    setEvents([]);
  };
  const delTask  = id => { setPlan(p=>p.filter(t=>t.id!==id)); setEvents([]); };
  const updTask  = (id,k,v) => { setPlan(p=>p.map(t=>t.id===id?{...t,[k]:v}:t)); setEvents([]); };
  const updCst   = (k,v) => { setCst(p=>normalizeCst({...p,[k]:v})); setEvents([]); setAlgoCompare(null); };
  const updEqCount = (eqType, n) => {
    setCst(p => {
      const nc = normalizeCst(p);
      return normalizeCst({ ...nc, eqCount: { ...normalizeEqCount(nc.eqCount), [eqType]: n } });
    });
    setEvents([]);
    setAlgoCompare(null);
  };
  const updDutySeg = (dayIdx, id, k, v) => {
    setCst(p => {
      const nc = normalizeCst(p);
      const week = nc.dutyRosterByDay.map((roster, i) =>
        i === dayIdx
          ? roster.map(seg => {
              if (seg.id !== id) return seg;
              const next = normalizeDutySeg({ ...seg, [k]: v });
              return next;
            })
          : roster
      );
      return { ...nc, dutyRosterByDay: week };
    });
    setEvents([]);
  };
  const updDutyNames = (dayIdx, id, names) => {
    setCst(p => {
      const nc = normalizeCst(p);
      const week = nc.dutyRosterByDay.map((roster, i) =>
        i === dayIdx
          ? roster.map(seg => seg.id === id
            ? normalizeDutySeg({ ...seg, names })
            : seg)
          : roster
      );
      return { ...nc, dutyRosterByDay: week };
    });
    setEvents([]);
  };
  const addDutySeg = (dayIdx) => {
    setCst(p => {
      const nc = normalizeCst(p);
      const week = nc.dutyRosterByDay.map((roster, i) => {
        if (i !== dayIdx) return roster;
        const sorted = [...roster].sort((a, b) => a.start - b.start);
        const lastEnd = sorted.length ? sorted[sorted.length - 1].end : nc.shiftStart;
        const start = Math.min(lastEnd, nc.shiftEnd - 1);
        const end = Math.min(start + 2, nc.shiftEnd);
        return [...sorted, { id: uid(), start, end, names: [], workers: 0 }];
      });
      return { ...nc, dutyRosterByDay: week };
    });
    setEvents([]);
  };
  const delDutySeg = (dayIdx, id) => {
    setCst(p => {
      const nc = normalizeCst(p);
      const week = nc.dutyRosterByDay.map((roster, i) =>
        i === dayIdx ? roster.filter(seg => seg.id !== id) : roster
      );
      return { ...nc, dutyRosterByDay: week };
    });
    setEvents([]);
  };
  const copyDutyToAllDays = (fromDayIdx) => {
    setCst(p => {
      const nc = normalizeCst(p);
      const template = cloneDutyRoster(getDutyRosterForDay(nc, fromDayIdx));
      return {
        ...nc,
        dutyRosterByDay: nc.dutyRosterByDay.map((_, i) => cloneDutyRoster(template)),
      };
    });
    setEvents([]);
  };

  const normCst = useMemo(() => normalizeCst(cst), [cst]);
  const activeDutyRoster = useMemo(
    () => getDutyRosterForDay(normCst, dutyDayTab),
    [normCst, dutyDayTab]
  );
  const dutyRosterErrors = useMemo(() => validateDutyRoster(normCst), [normCst]);
  const dutyRosterGaps = useMemo(
    () => getDutyRosterGapsForDay(normCst, activeDutyRoster),
    [normCst, activeDutyRoster]
  );

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.t0,
      fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      <RescheduleModal
        open={rescheduleOpen}
        onClose={()=>setRescheduleOpen(false)}
        onConfirm={handleReschedule}
        types={types}
        currentEvents={events}
        currentMakespan={makespan}
        cst={cst}/>

      {/* ── Top bar ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
        boxShadow:"0 1px 3px rgba(0,0,0,.05)",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 16px",
          display:"flex",justifyContent:"space-between",alignItems:"center",height:52}}>

          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{width:20,height:3,borderRadius:2,background:C.accent}}/>
              <div style={{width:14,height:3,borderRadius:2,background:C.dn}}/>
              <div style={{width:17,height:3,borderRadius:2,background:C.warn}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.14em",
                color:C.t3,textTransform:"uppercase",lineHeight:1}}>
                Production Planning · 一号线
              </div>
              <div style={{fontSize:16,fontWeight:800,color:C.t0,lineHeight:1.35,
                letterSpacing:"-0.02em"}}>
                日 / 周排产系统
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:11,color:C.t3}}>
              {planBatches} 批 · {types.length} 型号 · {cst.workDays}天计划
              {reschedHistory.length>0 && <span style={{color:C.warn,marginLeft:6}}>· 已重排{reschedHistory.length}次</span>}
            </div>
            <select value={algo} onChange={e=>{setAlgo(e.target.value);setEvents([]);}}
              style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border2}`,
                fontSize:11,fontWeight:600,color:C.t1,background:C.surface,cursor:"pointer",
                outline:"none"}}>
              <option value="greedy">启发式算法</option>
              <option value="hgnn-ppo">HGNN+PPO 智能调度</option>
            </select>
            <Btn onClick={runAlgoCompare} disabled={loading || compareLoading}>
              {compareLoading ? "⏳ 对比中…" : "⚖ 算法对比"}
            </Btn>
            <Btn primary onClick={generate} disabled={loading || compareLoading}>
              {loading ? "⏳ 求解中..." : "▶ 生成排产"}
            </Btn>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1080,margin:"0 auto",padding:"14px 16px"}}>

        {/* ── Tabs ── */}
        <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
          {[
            ["plan",   "📅 本周计划"],
            ["types",  "🧪 型号配置"],
            ["cst",    "⚙ 约束参数"],
            ["result", "📊 排产结果"],
          ].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{padding:"6px 14px",borderRadius:7,
                border:`1px solid ${tab===id?C.accent:C.border}`,cursor:"pointer",
                fontSize:12,fontWeight:600,
                background:tab===id?C.accentBg:C.surface,
                color:tab===id?C.accent:C.t2}}>
              {lbl}
              {id==="result"&&events.length>0&&(
                <span style={{marginLeft:5,padding:"1px 6px",borderRadius:99,
                  background:C.accent,color:"white",fontSize:10}}>
                  {batchCount}批
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════ 本周计划 ══════ */}
        {tab==="plan"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:12}}>
            <Card style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:14}}>
                <SecHead icon="📅">本周生产计划</SecHead>
                <Btn onClick={addTask}>＋ 新增任务</Btn>
              </div>

              {plan.length===0&&(
                <div style={{textAlign:"center",padding:32,color:C.t3,
                  background:"#f8fafc",borderRadius:8,border:`1px dashed ${C.border}`}}>
                  暂无任务，点击「新增任务」添加
                </div>
              )}

              {plan.map((task)=>{
                const pt = typeMap[task.typeId];
                return (
                  <div key={task.id} style={{marginBottom:10,padding:"12px 14px",
                    borderRadius:9,border:`1px solid ${pt?pt.color+"44":C.border}`,
                    background:pt?pt.color+"08":C.surface}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>

                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:11,color:C.t3}}>优先级</span>
                        <Stepper value={task.priority}
                          onChange={v=>updTask(task.id,"priority",v)}
                          min={0} max={10} color={C.accent}/>
                      </div>

                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:C.t3}}>型号</span>
                        <select value={task.typeId}
                          onChange={e=>updTask(task.id,"typeId",e.target.value)}
                          style={{padding:"4px 8px",borderRadius:6,
                            border:`1px solid ${C.border2}`,
                            background:C.surface,color:C.t0,fontSize:12,outline:"none"}}>
                          {types.map(t=>(
                            <option key={t.id} value={t.id}>{t.code}</option>
                          ))}
                        </select>
                        {pt&&<div style={{width:10,height:10,borderRadius:2,
                          background:pt.color,flexShrink:0}}/>}
                      </div>

                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:C.t3}}>批次</span>
                        <Stepper value={task.batches}
                          onChange={v=>updTask(task.id,"batches",v)}
                          min={1} max={20} color={pt?.color||C.t0}/>
                        <span style={{fontSize:11,color:C.t3}}>锅</span>
                      </div>

                      <input value={task.note} placeholder="备注（可选）"
                        onChange={e=>updTask(task.id,"note",e.target.value)}
                        style={{flex:1,minWidth:80,padding:"4px 8px",borderRadius:5,
                          border:`1px solid ${C.border}`,background:C.surface,
                          color:C.t1,fontSize:11,outline:"none"}}/>

                      <button onClick={()=>delTask(task.id)}
                        style={{padding:"3px 8px",borderRadius:4,
                          border:"1px solid #fecaca",cursor:"pointer",
                          background:"#fef2f2",color:C.danger,fontSize:11}}>✕</button>
                    </div>

                    {pt&&(
                      <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                        {pt.ops.map(op=>(
                          <span key={op.id} style={{fontSize:10,padding:"2px 7px",
                            borderRadius:4,background:pt.color+"15",color:pt.color,
                            border:`1px solid ${pt.color}33`}}>
                            {op.name} {fmtDur(op.dur)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Card style={{padding:14}}>
                <SecHead icon="📋">计划汇总</SecHead>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
                  {[
                    ["型号数", types.length+"种", C.accent],
                    ["总批次", planBatches+"锅",  C.dn],
                    ["排产天", cst.workDays+"天",  C.warn],
                    ["班次时", `${cst.shiftStart}:00-${cst.shiftEnd}:00`, C.t1],
                  ].map(([k,v,c])=>(
                    <div key={k} style={{padding:"8px 10px",background:"#f8fafc",
                      borderRadius:6,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:2}}>{k}</div>
                      <div style={{fontSize:14,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
                    </div>
                  ))}
                </div>
                {plan.map(task=>{
                  const pt = typeMap[task.typeId];
                  if (!pt) return null;
                  return (
                    <div key={task.id} style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",padding:"5px 0",
                      borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:2,background:pt.color}}/>
                        <span style={{fontSize:12,color:C.t1}}>{pt.code}</span>
                        <span style={{fontSize:11,color:C.t3}}>优先级{task.priority}</span>
                      </div>
                      <Badge color={pt.color}>{task.batches} 批</Badge>
                    </div>
                  );
                })}
              </Card>

              <Card style={{padding:14,border:`1px solid #fde68a`,background:C.warnBg}}>
                <SecHead color={C.warn} icon="💡">操作提示</SecHead>
                <div style={{fontSize:12,color:C.t1,lineHeight:1.7}}>
                  <div>① 调整优先级 → 数值小者优先(支持0)</div>
                  <div>② 在「型号配置」修改工艺参数</div>
                  <div>③ 在「约束参数」设置值班表/库存</div>
                  <div>④ 点击顶部「生成排产」出结果</div>
                  <div>⑤ 排产后可「🔄 动态重排」处理插单/故障</div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════ 型号配置 ══════ */}
        {tab==="types"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,color:C.t2}}>
                配置各产品型号的工艺参数，排产时系统自动按此计算工时
              </div>
              <Btn onClick={addType}>＋ 新增型号</Btn>
            </div>

            {types.map(pt=>(
              <Card key={pt.id} style={{marginBottom:12,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
                  borderBottom:`1px solid ${C.border}`,background:pt.color+"08",
                  cursor:"pointer"}}
                  onClick={()=>setOpenType(p=>({...p,[pt.id]:!p[pt.id]}))}>
                  <div style={{width:12,height:12,borderRadius:3,background:pt.color,flexShrink:0}}/>
                  <input value={pt.code} onClick={e=>e.stopPropagation()}
                    onChange={e=>updType(pt.id,"code",e.target.value)}
                    style={{fontSize:14,fontWeight:700,color:pt.color,background:"transparent",
                      border:"none",outline:"none",width:80}}/>
                  <span style={{fontSize:11,color:C.t3}}>
                    {pt.ops.length} 道工序
                  </span>

                  <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}
                    onClick={e=>e.stopPropagation()}>
                    <span style={{color:C.t3,fontSize:12}}>
                      {openType[pt.id]===false?"▼":"▲"}
                    </span>
                    <button onClick={e=>{e.stopPropagation();delType(pt.id);}}
                      style={{padding:"2px 8px",borderRadius:4,border:"1px solid #fecaca",
                        cursor:"pointer",background:"#fef2f2",color:C.danger,fontSize:11}}>✕</button>
                  </div>
                </div>

                {openType[pt.id]!==false&&(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
                      <thead>
                        <tr style={{background:"#f8fafc"}}>
                          {["#","工序名","设备","工时 (h)","清洗 (h)","AGV (h)","人员","原料A","原料B","脱模剂"].map((h,i)=>(
                            <th key={i} style={{padding:"7px 10px",fontSize:10,fontWeight:700,
                              textTransform:"uppercase",color:C.t3,textAlign:"left",
                              borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pt.ops.map((op,i)=>(
                          <tr key={op.id} style={{background:i%2===0?C.surface:"#f8fafc",
                            borderBottom:`1px solid ${C.border}`}}>
                            <td style={{padding:"7px 10px",fontSize:11,color:C.t3,
                              fontFamily:"monospace"}}>{i+1}</td>
                            <td style={{padding:"7px 10px"}}>
                              <input value={op.name} onChange={e=>updOp(pt.id,op.id,"name",e.target.value)}
                                style={{width:80,padding:"3px 7px",borderRadius:5,
                                  border:`1px solid ${C.border}`,background:C.surface,
                                  color:C.t0,fontSize:12,outline:"none"}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <select value={op.eq} onChange={e=>updOp(pt.id,op.id,"eq",e.target.value)}
                                style={{padding:"3px 7px",borderRadius:5,border:`1px solid ${C.border}`,
                                  background:C.surface,color:C.t0,fontSize:12,outline:"none"}}>
                                {EQ_ORDER.map(eq=><option key={eq} value={eq}>{eq}</option>)}
                              </select>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.dur} step={0.5}
                                onChange={v=>updOp(pt.id,op.id,"dur",Math.max(0.5,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.cleanDur||0} step={0.5} min={0} max={8}
                                onChange={v=>updOp(pt.id,op.id,"cleanDur",Math.max(0,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.agv||0} step={0.1} min={0} max={8}
                                onChange={v=>updOp(pt.id,op.id,"agv",Math.max(0,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <Stepper value={op.workers}
                                onChange={v=>updOp(pt.id,op.id,"workers",v)}
                                min={1} max={8} color={C.t1}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.matA||0} step={1} min={0} max={999}
                                onChange={v=>updOp(pt.id,op.id,"matA",v)}
                                style={{width:50}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.matB||0} step={1} min={0} max={999}
                                onChange={v=>updOp(pt.id,op.id,"matB",v)}
                                style={{width:50}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.release||0} step={0.1} min={0} max={99}
                                onChange={v=>updOp(pt.id,op.id,"release",v)}
                                style={{width:50}}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ══════ 约束参数 ══════ */}
        {tab==="cst"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontSize:13,color:C.t2,lineHeight:1.6}}>
              配置物料库存、班次与设备产能、值班人员；生成排产前请确认值班表无红色错误提示。
            </div>

            {/* 基础约束：单卡片统一排版 */}
            <Card style={{padding:16}}>
              <SecHead icon="⚙️">基础约束</SecHead>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
                    letterSpacing:"0.04em",marginBottom:10}}>📦 物料库存</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[
                      ["stockMatA",    "原料 A",  0, 9999, 1,   ""],
                      ["stockMatB",    "原料 B",  0, 9999, 1,   ""],
                      ["stockRelease", "脱模剂",  0, 9999, 0.1, ""],
                    ].map(([key,label,min,max,step,unit])=>(
                      <label key={key} style={{display:"block",padding:"10px 8px",borderRadius:8,
                        border:`1px solid ${C.border}`,background:"#f8fafc",cursor:"default"}}>
                        <div style={{fontSize:11,color:C.t2,marginBottom:8,textAlign:"center"}}>{label}</div>
                        <div style={{display:"flex",justifyContent:"center"}}>
                          <NumInput value={cst[key]} min={min} max={max} step={step} unit={unit}
                            onChange={v=>updCst(key,Math.max(min,v))}/>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
                    letterSpacing:"0.04em",marginBottom:10}}>🕐 班次与周期</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[
                      ["shiftStart", "开始", "时", 0, 23, 1],
                      ["shiftEnd",   "结束", "时", 1, 24, 1],
                      ["workDays",   "天数", "天", 1, 14, 1],
                    ].map(([key,label,unit,min,max,step])=>(
                      <label key={key} style={{display:"block",padding:"10px 8px",borderRadius:8,
                        border:`1px solid ${C.border}`,background:"#f8fafc",cursor:"default"}}>
                        <div style={{fontSize:11,color:C.t2,marginBottom:8,textAlign:"center"}}>{label}</div>
                        <div style={{display:"flex",justifyContent:"center"}}>
                          <NumInput value={cst[key]} min={min} max={max} step={step} unit={unit}
                            onChange={v=>updCst(key,Math.max(min,v))}/>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{marginTop:8,fontSize:10,color:C.t3,textAlign:"center"}}>
                    {String(cst.shiftStart).padStart(2,"0")}:00 — {String(cst.shiftEnd).padStart(2,"0")}:00 · 共 {cst.shiftEnd - cst.shiftStart}h/天
                  </div>
                </div>
              </div>

              <div style={{height:1,background:C.border,margin:"0 0 14px"}}/>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
                  letterSpacing:"0.04em",marginBottom:10}}>🏭 设备台数</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {EQ_ORDER.map(eq=>{
                    const n = normalizeEqCount(normCst.eqCount)[eq];
                    return (
                      <div key={eq} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,
                        padding:"10px 8px",borderRadius:8,background:"#f8fafc",
                        border:`1px solid ${C.border}`}}>
                        <span style={{fontSize:12,fontWeight:600,color:C.t1,whiteSpace:"nowrap"}}>{eq}</span>
                        <Stepper value={n} min={1} max={5} onChange={v=>updEqCount(eq,v)} color={C.accent}/>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* HGNN 求解参数 */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <SecHead icon="🧠" style={{ margin: 0 }}>HGNN+PPO 求解参数</SecHead>
                <button type="button" onClick={() => setHgnnAdvancedOpen(o => !o)}
                  style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface,
                    fontSize: 11, color: C.t2, cursor: "pointer" }}>
                  {hgnnAdvancedOpen ? "收起高级参数 ▲" : "高级参数 ▼"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>
                以下为调优后推荐默认值；仅在选择 HGNN+PPO 或「算法对比」时生效
              </div>
              <div style={{ display: "grid", gridTemplateColumns: hgnnAdvancedOpen ? "repeat(3,1fr)" : "1fr", gap: 10 }}>
                <div style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.accentBdr}`, background: C.accentBg }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, marginBottom: 8 }}>训练轮数 episodes（推荐）</div>
                  <NumInput value={hgnnParams.episodes} min={50} max={2000} step={50} unit="轮"
                    onChange={v => updHgnnParam("episodes", Math.max(50, v))}/>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>默认 {DEFAULT_HGNN_PARAMS.episodes} · 越大越慢、结果可能更优</div>
                </div>
                {hgnnAdvancedOpen && [
                  ["lr", "学习率 lr", 0.00001, 0.01, 0.00001, ""],
                  ["gamma", "折扣因子 γ", 0.9, 0.999, 0.01, ""],
                  ["epsClip", "PPO clip ε", 0.05, 0.5, 0.05, ""],
                  ["entropyCoef", "熵系数", 0, 0.1, 0.01, ""],
                  ["d", "隐层维度 d", 32, 128, 8, ""],
                ].map(([key, label, min, max, step]) => (
                  <div key={key} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#f8fafc" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8 }}>{label}</div>
                    <NumInput value={hgnnParams[key]} min={min} max={max} step={step}
                      onChange={v => updHgnnParam(key, key === "d" ? Math.round(v) : v)}/>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>默认 {DEFAULT_HGNN_PARAMS[key]}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Btn onClick={() => { setHgnnParams({ ...DEFAULT_HGNN_PARAMS }); setEvents([]); setAlgoCompare(null); }}>
                  恢复默认
                </Btn>
              </div>
            </Card>

            {/* 值班表：全宽 */}
            <Card style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                flexWrap:"wrap",gap:10,marginBottom:12}}>
                <div>
                  <SecHead icon="👥" style={{margin:0}}>值班表（按工作日）</SecHead>
                  <div style={{fontSize:11,color:C.t3,marginTop:6,maxWidth:520}}>
                    周一至周五分别配置；填写姓名（一人一格），人数自动统计；空档时段不可排产
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <Btn onClick={()=>copyDutyToAllDays(dutyDayTab)}>复制到全周</Btn>
                  <Btn onClick={()=>addDutySeg(dutyDayTab)}>＋ 添加时段</Btn>
                </div>
              </div>

              <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
                {Array.from({ length: normCst.workDays }, (_, d) => (
                  <button key={d} onClick={()=>setDutyDayTab(d)}
                    style={{padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,
                      border:`1px solid ${dutyDayTab===d?C.accent:C.border}`,
                      background:dutyDayTab===d?C.accentBg:C.surface,
                      color:dutyDayTab===d?C.accent:C.t2}}>
                    {DAYS_ZH[d]}
                  </button>
                ))}
              </div>

              <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:560}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      {["开始","结束","值班人员",""].map(h=>(
                        <th key={h} style={{padding:"8px 12px",textAlign:"left",
                          fontSize:10,color:C.t3,fontWeight:700,
                          borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...activeDutyRoster].sort((a,b)=>a.start-b.start).map(seg=>(
                      <tr key={seg.id} style={{borderBottom:`1px solid ${C.border}`,
                        background:C.surface}}>
                        <td style={{padding:"8px 12px",width:100}}>
                          <NumInput value={seg.start} min={0} max={23} step={1} unit="时"
                            onChange={v=>updDutySeg(dutyDayTab, seg.id,"start",v)}/>
                        </td>
                        <td style={{padding:"8px 12px",width:100}}>
                          <NumInput value={seg.end} min={1} max={24} step={1} unit="时"
                            onChange={v=>updDutySeg(dutyDayTab, seg.id,"end",v)}/>
                        </td>
                        <td style={{padding:"8px 12px",verticalAlign:"top"}}>
                          <DutyNameEditor
                            names={seg.names || []}
                            onChange={names=>updDutyNames(dutyDayTab, seg.id, names)}
                            max={20}/>
                        </td>
                        <td style={{padding:"8px 12px",width:44,textAlign:"center"}}>
                          <button onClick={()=>delDutySeg(dutyDayTab, seg.id)}
                            disabled={activeDutyRoster.length<=1}
                            style={{border:"none",background:"transparent",color:C.danger,
                              cursor:activeDutyRoster.length<=1?"not-allowed":"pointer",
                              opacity:activeDutyRoster.length<=1?0.4:1,fontSize:14}}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{padding:"8px 12px",borderRadius:6,
                  background:C.accentBg,border:`1px solid ${C.accentBdr}`,
                  fontSize:11,color:C.accent,lineHeight:1.7}}>
                  <strong>{DAYS_ZH[dutyDayTab]}</strong>：{formatDutyRosterSummary(activeDutyRoster) || "请配置值班时段"}
                </div>
                {dutyRosterGaps.length>0 && (
                  <div style={{padding:"8px 12px",borderRadius:6,
                    background:C.warnBg,border:"1px solid #fde68a",
                    fontSize:11,color:C.warn,lineHeight:1.7}}>
                    {dutyRosterGaps.map((g,i)=>(
                      <div key={i}>
                        · {String(g.start).padStart(2,"0")}:00–{String(g.end).padStart(2,"0")}:00 无人在岗（不可排产）
                      </div>
                    ))}
                  </div>
                )}
                {dutyRosterErrors.length>0 && (
                  <div style={{padding:"8px 12px",borderRadius:6,
                    background:"#fef2f2",border:"1px solid #fecaca",
                    fontSize:11,color:C.danger,lineHeight:1.7}}>
                    {dutyRosterErrors.map((e,i)=><div key={i}>· {e}</div>)}
                  </div>
                )}
              </div>
            </Card>

            {/* 底部：配置摘要 + 约束说明 */}
            <div style={{display:"grid",gridTemplateColumns:"minmax(260px,1fr) minmax(320px,1.4fr)",gap:12}}>
              <Card style={{padding:14,background:C.accentBg,border:`1px solid ${C.accentBdr}`}}>
                <SecHead color={C.accent} icon="📌" style={{margin:"0 0 10px"}}>当前有效配置</SecHead>
                <div style={{display:"grid",gap:8,fontSize:12,color:C.accent}}>
                  {[
                    ["班次", `${String(cst.shiftStart).padStart(2,"0")}:00 — ${String(cst.shiftEnd).padStart(2,"0")}:00（${cst.shiftEnd - cst.shiftStart}h/天，不停线）`],
                    ["周期", `${cst.workDays} 个工作日`],
                    ["设备", formatEqCountSummary(normCst)],
                    ["库存", `原料A ${cst.stockMatA} · 原料B ${cst.stockMatB} · 脱模剂 ${cst.stockRelease}`],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",gap:8,lineHeight:1.5}}>
                      <span style={{fontWeight:700,minWidth:36,flexShrink:0}}>{k}</span>
                      <span style={{opacity:0.95}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.accentBdr}`,
                  fontSize:11,color:C.accent,lineHeight:1.65,opacity:0.9}}>
                  <div style={{fontWeight:700,marginBottom:4}}>值班摘要</div>
                  {Array.from({ length: normCst.workDays }, (_, d) => (
                    <div key={d}>{DAYS_ZH[d]}：{formatDutyRosterSummary(getDutyRosterForDay(normCst, d)) || "未配置"}</div>
                  ))}
                </div>
              </Card>

              <Card style={{padding:14,border:`1px solid #fde68a`,background:C.warnBg}}>
                <SecHead color={C.warn} icon="⚠️" style={{margin:"0 0 10px"}}>约束说明</SecHead>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,fontSize:12,color:C.t1}}>
                  {[
                    [C.warn,  "工序清洗", "型号配置中设置清洗时间，清洗期间设备不可用"],
                    [C.dn,    "班次边界", "工序不跨日班次；剩余时间不足则顺延至下一工作日"],
                    [C.accent,"值班人员", "各时段在岗人数不同，工序所需人数不得超过值班人数"],
                    ["#8b5cf6","设备并行", "同类型多台独立排产；故障可登记到具体实例"],
                  ].map(([color,title,desc])=>(
                    <div key={title} style={{padding:"8px 10px",background:C.surface,borderRadius:6,
                      borderLeft:`3px solid ${color}`}}>
                      <strong style={{color}}>{title}</strong>
                      <div style={{marginTop:4,color:C.t2,lineHeight:1.5,fontSize:11}}>{desc}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════ 排产结果 ══════ */}
        {tab==="result"&&(
          <div>
            <AlgoComparePanel
              compare={algoCompare}
              loading={compareLoading}
              onAdopt={adoptCompareResult}
            />
            {events.length===0 && !compareLoading && !algoCompare ? (
              <Card style={{padding:60,textAlign:"center"}}>
                <div style={{fontSize:44,marginBottom:12}}>📋</div>
                <p style={{fontSize:14,color:C.t2,marginBottom:16}}>
                  尚未生成排产方案，请点击「生成排产」或「算法对比」
                </p>
                <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                  <Btn primary onClick={generate} disabled={loading || compareLoading}>
                    {loading ? "⏳ 求解中..." : "▶ 立即生成排产"}
                  </Btn>
                  <Btn onClick={runAlgoCompare} disabled={loading || compareLoading}>⚖ 算法对比</Btn>
                </div>
              </Card>
            ): events.length===0 && algoCompare ? (
              <Card style={{padding:24,textAlign:"center",marginBottom:12}}>
                <p style={{fontSize:13,color:C.t2,marginBottom:12}}>对比已完成，请选择上方「采用启发式」或「采用 HGNN+PPO」查看甘特图</p>
              </Card>
            ):(
              <>
                {/* ── KPI cards ── */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",
                  gap:10,marginBottom:12}}>
                  {[
                    {l:"调度算法",v:algo==="greedy"?"启发式":"HGNN+PPO", c:algo==="greedy"?C.t1:"#7c3aed", s:algo==="greedy"?"默认":"智能调度"},
                    {l:"完工时间",v:fmtTime(makespan),    c:C.danger, s:"预计"},
                    {l:"批次总数",v:batchCount+"批",       c:C.accent, s:"已排"},
                    {l:"工序总数",v:opCount+"道",           c:C.dn,     s:"含清洗"},
                    {l:"班次工时",v:(cst.shiftEnd-cst.shiftStart)+"h/天",c:C.warn,     s:"每日"},
                  ].map(({l,v,c,s})=>(
                    <Card key={l} style={{padding:12,borderTop:`3px solid ${c}`}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:3}}>{l}</div>
                      <div style={{fontSize:18,fontWeight:800,color:c,
                        fontFamily:"monospace",letterSpacing:"-0.03em"}}>{v}</div>
                      <div style={{fontSize:10,color:C.t3,marginTop:3}}>{s}</div>
                    </Card>
                  ))}
                </div>

                {/* ── 重排状态横幅 ── */}
                {rescheduleAt!=null && (
                  <Card style={{padding:"10px 14px",marginBottom:12,
                    background:"linear-gradient(90deg,#fef3c7,#fef9c3)",
                    border:`1px solid #fde68a`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div style={{fontSize:12,color:C.t1}}>
                        🔄 <b>动态重排已生效</b> · 基准时刻 <b style={{color:C.danger,fontFamily:"monospace"}}>{fmtTime(rescheduleAt)}</b>
                        {failures.length>0 && <> · 故障 <b style={{color:C.danger}}>{failures.length}</b> 处</>}
                        · 重排次数 <b>{reschedHistory.length}</b>
                      </div>
                      <div style={{fontSize:11,color:C.t3}}>
                        🔒=已完成/进行中冻结 &nbsp; 🟡虚线=新排
                      </div>
                    </div>
                  </Card>
                )}

                {/* ── Equipment utilization ── */}
                <Card style={{padding:14,marginBottom:12}}>
                  <SecHead icon="🔧">设备利用率</SecHead>
                  <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                    {getEqInstances(cst).filter(inst=>events.some(e=>e.eq===inst)).map(inst=>(
                      <div key={inst} style={{flex:1,minWidth:120}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          marginBottom:4,fontSize:11}}>
                          <span style={{color:C.t1,fontWeight:600}}>{inst}</span>
                          <span style={{color:C.accent,fontFamily:"monospace",fontWeight:700}}>
                            {eqUtil[inst]||0}%
                          </span>
                        </div>
                        <div style={{background:C.border,borderRadius:3,height:5,overflow:"hidden"}}>
                          <div style={{width:`${eqUtil[inst]||0}%`,height:"100%",
                            background:C.accent,borderRadius:3}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* ── View toggle ── */}
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                  {[["gantt","▦ 甘特图"],["workorder","📋 工单"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setView(id)}
                      style={{padding:"6px 14px",borderRadius:7,
                        border:`1px solid ${view===id?C.accent:C.border}`,
                        cursor:"pointer",fontSize:12,fontWeight:600,
                        background:view===id?C.accentBg:C.surface,
                        color:view===id?C.accent:C.t2}}>{lbl}</button>
                  ))}
                  <Btn onClick={exportPDF} style={{marginLeft:4}}>📄 导出 PDF</Btn>
                  <Btn danger onClick={()=>setRescheduleOpen(true)} style={{marginLeft:4}}>
                    🔄 动态重排
                  </Btn>
                  <div style={{flex:1}}/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {[...new Set(events.map(e=>e.ptCode))].map(code=>{
                      const ev = events.find(e=>e.ptCode===code);
                      const cnt = new Set(events.filter(e=>e.ptCode===code&&!e.isCleaning)
                        .map(e=>e.batchLabel)).size;
                      return ev&&(
                        <Badge key={code} color={ev.ptColor}>{code} × {cnt}批</Badge>
                      );
                    })}
                    <Badge color={CLEAN_COL} bg={CLEAN_COL+"15"}>🧹 清洗</Badge>
                  </div>
                </div>

                {/* ── Views ── */}
                <Card style={{padding:16}}>
                  {view==="gantt"&&<GanttChart events={events} cst={cst} rescheduleAt={rescheduleAt} failures={failures}/>}
                  {view==="workorder"&&<WorkOrderTable events={events}/>}
                </Card>

                {/* ── 重排历史 ── */}
                {reschedHistory.length>0 && (
                  <Card style={{padding:14,marginTop:12}}>
                    <SecHead icon="📜">重排历史</SecHead>
                    <div style={{fontSize:12,color:C.t1}}>
                      {reschedHistory.map((h,i)=>(
                        <div key={i} style={{padding:"6px 0",borderBottom:i<reschedHistory.length-1?`1px solid ${C.border}`:"none",
                          display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <div>
                            <Badge color={C.warn}>#{i+1}</Badge>
                            <span style={{color:C.t2,fontSize:11}}>{h.time}</span>
                            <span style={{marginLeft:8,fontFamily:"monospace",color:C.danger}}>
                              基准 {fmtTime(h.at)}
                            </span>
                          </div>
                          <div style={{fontSize:11,color:C.t2}}>
                            冻结{h.stats.frozenCount} · 新排{h.stats.newCount}
                            {h.failuresAdded>0 && <> · +故障{h.failuresAdded}</>}
                            {h.newTasksAdded>0 && <> · +插单{h.newTasksAdded}</>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* <AgentWidget context={{ algo, tab, hasEvents: events.length > 0 }} /> */}
    </div>
  );
}
