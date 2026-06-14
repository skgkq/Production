/**
 * 班次与人员约束（从原系统精简复制）
 */

const DAYS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function normalizeCst(cst) {
  const base = {
    shiftStart: 8,
    shiftEnd: 18,
    workDays: 5,
    roomList: [1, 2, 3, 4, 5, 6, 7, 8],
    totalWorkers: 4,
    ...cst,
  };
  base.roomList = [...(base.roomList || [])].map(Number).filter(n => n > 0);
  if (!base.roomList.length) base.roomList = [1];
  return base;
}

function makeDefaultDutyDay(cst) {
  return [{
    id: "d1",
    start: cst.shiftStart,
    end: cst.shiftEnd,
    workers: cst.totalWorkers,
  }];
}

export function getDutyRosterForDay(cst, dayIdx) {
  const week = cst.dutyRosterByDay;
  if (week?.[dayIdx]?.length) return week[dayIdx];
  return makeDefaultDutyDay(cst);
}

export function nextWorkStart(t, cst) {
  for (let i = 0; i < 500; i++) {
    if (t >= cst.workDays * 24) return Infinity;
    const day = Math.floor(t / 24);
    const h = t % 24;
    if (h < cst.shiftStart) { t = day * 24 + cst.shiftStart; continue; }
    if (h >= cst.shiftEnd) { t = (day + 1) * 24 + cst.shiftStart; continue; }
    return t;
  }
  return Infinity;
}

function getDutyCapacityAt(t, cst) {
  const dayIdx = Math.floor(t / 24);
  const hour = t % 24;
  for (const seg of getDutyRosterForDay(cst, dayIdx)) {
    if (hour >= seg.start && hour < seg.end) return seg.workers;
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
  if (!needed || needed <= 0) return true;
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

export function findRoomSlot(room, tl, minStart, dur, cst, workerTl, workers) {
  let t = nextWorkStart(minStart, cst);

  for (let iter = 0; iter < 50000; iter++) {
    if (t === Infinity) return Infinity;
    t = nextWorkStart(t, cst);
    if (t === Infinity) return Infinity;

    const dayBase = Math.floor(t / 24) * 24;
    const shiftEnd = dayBase + cst.shiftEnd;
    if (t + dur > shiftEnd) { t = nextWorkStart(shiftEnd, cst); continue; }

    const clash = (tl || []).find(s => s.start < t + dur && s.end > t);
    if (clash) { t = nextWorkStart(clash.end, cst); continue; }

    if (!workersFit(workerTl, t, dur, workers, cst)) {
      t = nextWorkStart(nextWorkerFreeTime(workerTl, t, dur, workers, cst), cst);
      continue;
    }

    return t;
  }
  return Infinity;
}

export function findBestRoomSlot(op, roomTls, minStart, cst, workerTl) {
  const rooms = op.rooms || [];
  let bestStart = Infinity;
  let bestRoom = rooms[0];

  for (const room of rooms) {
    const tl = roomTls[room] || [];
    const start = findRoomSlot(room, tl, minStart, op.dur, cst, workerTl, op.workers || 1);
    if (start < bestStart) {
      bestStart = start;
      bestRoom = room;
    }
  }

  return { start: bestStart, room: bestRoom };
}

export { DAYS_ZH };
