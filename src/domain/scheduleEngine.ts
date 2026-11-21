import { formatMinutes, type StopScheduleStatus, type Trip, type TripStop } from './trip';

export type ConflictSeverity = 'error' | 'warning';

export type ConflictCode =
  | 'closed_day'
  | 'after_closing'
  | 'past_deadline'
  | 'tight_closing'
  | 'accessibility_mismatch';

export interface ScheduleConflict {
  stopId: string;
  stopName: string;
  severity: ConflictSeverity;
  code: ConflictCode;
  message: string;
}

export interface EvaluatedStop {
  stop: TripStop;
  index: number;
  rawArrivalMin: number;
  waitForOpeningMin: number;
  arrivalMin: number;
  departureMin: number;
  slackToCloseMin: number;
  status: StopScheduleStatus;
  conflicts: ScheduleConflict[];
}

export interface ScheduleEvaluation {
  evaluatedStops: EvaluatedStop[];
  conflicts: ScheduleConflict[];
  errorCount: number;
  warningCount: number;
  totalEndMin: number;
  returnDeadlineMarginMin: number;
  isValid: boolean;
}

export type TripPatchOp =
  | {
      op: 'shift_start_time';
      startTimeMin: number;
      reason?: string;
    }
  | {
      op: 'update_duration';
      stopId: string;
      durationMin: number;
      reason?: string;
    }
  | {
      op: 'reorder_stops';
      orderedStopIds: string[];
      reason?: string;
    }
  | {
      op: 'replace_stop';
      stopId: string;
      replacement: Omit<TripStop, 'id'> & { id?: string };
      reason?: string;
    }
  | {
      op: 'append_note';
      stopId: string;
      note: string;
      reason?: string;
    };

export interface ScheduleDiffSummary {
  beforeErrors: number;
  afterErrors: number;
  beforeWarnings: number;
  afterWarnings: number;
  beforeMarginMin: number;
  afterMarginMin: number;
  resolvedConflicts: number;
}

export function evaluateTripSchedule(trip: Trip): ScheduleEvaluation {
  let cursorMin = trip.startTimeMin;
  const evaluatedStops: EvaluatedStop[] = [];
  const allConflicts: ScheduleConflict[] = [];

  trip.stops.forEach((stop, index) => {
    const rawArrivalMin = cursorMin + Math.max(0, stop.transitFromPrevMin);
    const waitForOpeningMin =
      rawArrivalMin < stop.openMin ? stop.openMin - rawArrivalMin : 0;
    const arrivalMin = rawArrivalMin + waitForOpeningMin;
    const departureMin = arrivalMin + Math.max(15, stop.durationMin);
    const slackToCloseMin = stop.closeMin - departureMin;

    const conflicts: ScheduleConflict[] = [];

    if (stop.closedDays.includes(trip.dayOfWeek)) {
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        severity: 'error',
        code: 'closed_day',
        message: `${stop.name} is closed on ${trip.dayOfWeek}.`,
      });
    }

    if (departureMin > stop.closeMin) {
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        severity: 'error',
        code: 'after_closing',
        message: `${stop.name} finishes at ${formatMinutes(departureMin)}, after closing (${formatMinutes(stop.closeMin)}).`,
      });
    } else if (slackToCloseMin >= 0 && slackToCloseMin < 15 && stop.closeMin < 1439) {
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        severity: 'warning',
        code: 'tight_closing',
        message: `Only ${slackToCloseMin} min buffer before ${stop.name} closes at ${formatMinutes(stop.closeMin)}.`,
      });
    }

    if (departureMin > trip.returnDeadlineMin) {
      const overMin = departureMin - trip.returnDeadlineMin;
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        severity: 'error',
        code: 'past_deadline',
        message: `${stop.name} ends at ${formatMinutes(departureMin)} (+${overMin}m past ${trip.returnDeadlineLabel}).`,
      });
    }

    if (
      (trip.travelerProfile.needsWheelchairAccess && !stop.wheelchairFriendly) ||
      (trip.travelerProfile.prefersLowWalking && stop.walkingBurden === 'high')
    ) {
      conflicts.push({
        stopId: stop.id,
        stopName: stop.name,
        severity: 'warning',
        code: 'accessibility_mismatch',
        message: `${stop.name} has ${stop.walkingBurden} walking / limited step-free access for ${trip.travelerProfile.label}.`,
      });
    }

    let status: StopScheduleStatus = 'on_time';
    if (conflicts.some((c) => c.code === 'closed_day' || c.code === 'after_closing')) {
      status = 'closed';
    } else if (conflicts.some((c) => c.code === 'past_deadline')) {
      status = 'past_deadline';
    } else if (conflicts.some((c) => c.severity === 'warning')) {
      status = 'tight';
    }

    evaluatedStops.push({
      stop,
      index,
      rawArrivalMin,
      waitForOpeningMin,
      arrivalMin,
      departureMin,
      slackToCloseMin,
      status,
      conflicts,
    });
    allConflicts.push(...conflicts);
    cursorMin = departureMin;
  });

  const totalEndMin =
    evaluatedStops.length > 0
      ? evaluatedStops[evaluatedStops.length - 1].departureMin
      : trip.startTimeMin;
  const returnDeadlineMarginMin = trip.returnDeadlineMin - totalEndMin;
  const errorCount = allConflicts.filter((c) => c.severity === 'error').length;
  const warningCount = allConflicts.filter((c) => c.severity === 'warning').length;

  return {
    evaluatedStops,
    conflicts: allConflicts,
    errorCount,
    warningCount,
    totalEndMin,
    returnDeadlineMarginMin,
    isValid: errorCount === 0,
  };
}

export function applyProposalOps(trip: Trip, ops: TripPatchOp[]): Trip {
  const next: Trip = structuredClone(trip);

  for (const op of ops) {
    switch (op.op) {
      case 'shift_start_time': {
        if (Number.isFinite(op.startTimeMin)) {
          next.startTimeMin = Math.max(300, Math.min(1200, Math.round(op.startTimeMin)));
        }
        break;
      }
      case 'update_duration': {
        const target = next.stops.find((s) => s.id === op.stopId);
        if (target && Number.isFinite(op.durationMin)) {
          target.durationMin = Math.max(15, Math.min(360, Math.round(op.durationMin)));
        }
        break;
      }
      case 'reorder_stops': {
        const byId = new Map(next.stops.map((s) => [s.id, s]));
        const reordered: TripStop[] = [];
        for (const id of op.orderedStopIds) {
          const item = byId.get(id);
          if (item) {
            reordered.push(item);
            byId.delete(id);
          }
        }
        for (const leftover of byId.values()) {
          reordered.push(leftover);
        }
        next.stops = reordered;
        break;
      }
      case 'replace_stop': {
        const idx = next.stops.findIndex((s) => s.id === op.stopId);
        if (idx !== -1) {
          const prev = next.stops[idx];
          const rep = op.replacement;
          next.stops[idx] = {
            ...prev,
            ...rep,
            id: rep.id || prev.id,
            durationMin: Math.max(15, Math.min(360, Math.round(rep.durationMin ?? prev.durationMin))),
            transitFromPrevMin: Math.max(0, Math.min(240, Math.round(rep.transitFromPrevMin ?? prev.transitFromPrevMin))),
          };
        }
        break;
      }
      case 'append_note': {
        const target = next.stops.find((s) => s.id === op.stopId);
        if (target && op.note.trim()) {
          target.notes = target.notes
            ? `${target.notes} | ${op.note.trim()}`
            : op.note.trim();
        }
        break;
      }
    }
  }

  next.updatedAt = Date.now();
  return next;
}

export function diffSchedule(
  before: ScheduleEvaluation,
  after: ScheduleEvaluation
): ScheduleDiffSummary {
  return {
    beforeErrors: before.errorCount,
    afterErrors: after.errorCount,
    beforeWarnings: before.warningCount,
    afterWarnings: after.warningCount,
    beforeMarginMin: before.returnDeadlineMarginMin,
    afterMarginMin: after.returnDeadlineMarginMin,
    resolvedConflicts: Math.max(0, before.errorCount - after.errorCount),
  };
}
