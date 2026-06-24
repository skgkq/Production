/**
 * 根据排产结果为各工步分配具体人员（等级资格 + 负载均衡，严格模式）
 */

import { DEFAULT_STAFF_LIST } from "../data/opsSeed.js";
import { normalizeWorkersFields, workersRangeLabel } from "./workersRange.js";

function isFree(schedule, start, end) {
  return !schedule.some(s => s.start < end && s.end > start);
}

function clampLevel(level) {
  return Math.max(2, Math.min(5, Math.floor(Number(level) || 3)));
}

/** 兼容 staffList / staffNames */
export function normalizeStaffList(input) {
  if (Array.isArray(input) && input.length && typeof input[0] === "object" && input[0]?.name) {
    return input
      .map(s => ({ name: String(s.name).trim(), level: clampLevel(s.level) }))
      .filter(s => s.name);
  }
  if (Array.isArray(input) && input.length) {
    return input.map(name => ({ name: String(name).trim(), level: 3 })).filter(s => s.name);
  }
  return DEFAULT_STAFF_LIST.map(s => ({ ...s }));
}

/**
 * @param {Array} events 排产事件
 * @param {Array} staffList [{ name, level }]
 */
export function assignStaffToEvents(events, staffList) {
  const staff = normalizeStaffList(staffList);
  const schedules = Object.fromEntries(staff.map(s => [s.name, []]));
  const load = Object.fromEntries(staff.map(s => [s.name, 0]));

  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const enriched = [];
  const staffRows = [];
  let shortageCount = 0;

  for (const event of sorted) {
    const { workersMin, workersMax } = normalizeWorkersFields(event);
    const reqLevel = clampLevel(event.requiredLevel ?? 3);

    const eligible = staff
      .filter(s => s.level >= reqLevel && isFree(schedules[s.name], event.start, event.end))
      .sort((a, b) => load[a.name] - load[b.name] || a.name.localeCompare(b.name));

    const countToAssign = Math.min(eligible.length, workersMax);
    const assigned = eligible.slice(0, countToAssign);
    const assignErrors = [];

    if (assigned.length < workersMin) {
      shortageCount++;
      const rangeLabel = workersRangeLabel(event);
      assignErrors.push(
        `需 ${rangeLabel} 人（L${reqLevel}+），当前可用 ${eligible.length} 人，已派 ${assigned.length} 人（不降级派低等级人员）`
      );
    }

    for (const person of assigned) {
      schedules[person.name].push({ start: event.start, end: event.end, opId: event.opId });
      load[person.name] += event.dur || (event.end - event.start);
      staffRows.push({
        key: `${person.name}-${event.opId}-${event.wo}-${event.start}`,
        staffName: person.name,
        staffLevel: person.level,
        requiredLevel: reqLevel,
        wo: event.wo,
        batchLabel: event.batchLabel,
        opId: event.opId,
        opName: event.opName,
        opGroup: event.opGroup,
        room: event.room,
        start: event.start,
        end: event.end,
        dur: event.dur,
      });
    }

    enriched.push({
      ...event,
      requiredLevel: reqLevel,
      workersMin,
      workersMax,
      assignedCount: assigned.length,
      assignedStaff: assigned.map(p => p.name),
      assignStatus: assigned.length >= workersMin ? "OK" : "SHORTAGE",
      assignErrors,
    });
  }

  staffRows.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.start - b.start);

  const staffSummary = {};
  for (const person of staff) {
    const tasks = staffRows.filter(r => r.staffName === person.name);
    staffSummary[person.name] = {
      level: person.level,
      taskCount: tasks.length,
      totalHours: tasks.reduce((s, t) => s + (t.dur || 0), 0),
    };
  }

  return { events: enriched, staffRows, staffSummary, shortageCount };
}
