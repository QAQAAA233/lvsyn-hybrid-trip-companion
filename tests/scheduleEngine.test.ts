import { describe, expect, it } from 'vitest';
import { PRESET_TRIPS, cloneTrip } from '../src/domain/presets';
import {
  applyProposalOps,
  diffSchedule,
  evaluateTripSchedule,
} from '../src/domain/scheduleEngine';

describe('Deterministic Schedule Engine', () => {
  it('detects closed Tuesdays, steep senior access warning, and missed Shinkansen deadline on Kyoto preset', () => {
    const kyoto = cloneTrip(PRESET_TRIPS[0]);
    const evalResult = evaluateTripSchedule(kyoto);

    expect(evalResult.isValid).toBe(false);
    expect(evalResult.conflicts.some((c) => c.code === 'closed_day' && c.stopId === 'kyoto-stop-2')).toBe(true);
    expect(evalResult.conflicts.some((c) => c.code === 'past_deadline')).toBe(true);
    expect(
      evalResult.conflicts.some(
        (c) => c.code === 'accessibility_mismatch' && c.stopId === 'kyoto-stop-3'
      )
    ).toBe(true);
    expect(evalResult.returnDeadlineMarginMin).toBeLessThan(0);
  });

  it('resolves all conflicts cleanly when valid patchOps are applied without mutating original until kept', () => {
    const original = cloneTrip(PRESET_TRIPS[0]);
    const beforeEval = evaluateTripSchedule(original);

    const patched = applyProposalOps(original, [
      {
        op: 'replace_stop',
        stopId: 'kyoto-stop-2',
        replacement: {
          name: 'Kyoto Railway & Heritage Pavilion (Indoor)',
          category: 'Museum',
          durationMin: 75,
          transitFromPrevMin: 30,
          openMin: 570,
          closeMin: 1050,
          closedDays: ['Wed'],
          indoor: true,
          wheelchairFriendly: true,
          walkingBurden: 'low',
          notes: 'Step-free access.',
        },
      },
      {
        op: 'replace_stop',
        stopId: 'kyoto-stop-3',
        replacement: {
          name: 'Sanjusangendo Flat Temple Hall',
          category: 'Temple',
          durationMin: 75,
          transitFromPrevMin: 20,
          openMin: 510,
          closeMin: 1020,
          closedDays: [],
          indoor: true,
          wheelchairFriendly: true,
          walkingBurden: 'low',
          notes: 'Flat wooden corridor.',
        },
      },
      { op: 'update_duration', stopId: 'kyoto-stop-4', durationMin: 75 },
      { op: 'update_duration', stopId: 'kyoto-stop-5', durationMin: 65 },
    ]);

    // Original must remain untouched for Keep/Discard preview isolation
    expect(original.stops[1].name).toBe('Kyoto National Museum');

    const afterEval = evaluateTripSchedule(patched);
    const diff = diffSchedule(beforeEval, afterEval);

    expect(afterEval.isValid).toBe(true);
    expect(afterEval.errorCount).toBe(0);
    expect(afterEval.warningCount).toBe(0);
    expect(afterEval.returnDeadlineMarginMin).toBeGreaterThanOrEqual(45);
    expect(diff.resolvedConflicts).toBe(beforeEval.errorCount);
  });
});
