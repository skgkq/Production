/** 工步人数区间：排产用上限，派工在 min~max 内取实际值 */

export function normalizeWorkersFields(op) {
  let min = op.workersMin;
  let max = op.workersMax;
  if (min == null && max == null) {
    const w = Math.max(1, Math.floor(Number(op.workers) || 1));
    min = w;
    max = w;
  } else {
    min = Math.max(1, Math.floor(Number(min ?? max ?? op.workers) || 1));
    max = Math.max(min, Math.floor(Number(max ?? min ?? op.workers) || min));
  }
  return { workersMin: min, workersMax: max, workers: max };
}

export function formatWorkersRange(min, max) {
  if (min == null || max == null) return "—";
  return min === max ? `${min}` : `${min}~${max}`;
}

export function workersRangeLabel(opOrEvent) {
  const { workersMin, workersMax } = normalizeWorkersFields(opOrEvent);
  return formatWorkersRange(workersMin, workersMax);
}
