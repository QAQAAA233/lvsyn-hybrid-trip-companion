import type { ScheduleEvaluation } from '../domain/scheduleEngine';
import { formatMinutes, type Trip } from '../domain/trip';

export function buildTripContextBlock(trip: Trip, evaluation: ScheduleEvaluation): string {
  const stopLines = evaluation.evaluatedStops.map((ev) => {
    const s = ev.stop;
    const flags = [
      s.indoor ? 'indoor' : 'outdoor',
      s.wheelchairFriendly ? 'step-free' : 'stairs/limited-access',
      `walk:${s.walkingBurden}`,
      s.closedDays.length > 0 ? `closed:${s.closedDays.join(',')}` : 'open-daily',
    ].join(', ');
    return `- [${s.id}] ${s.name} (${s.category}) | ${formatMinutes(ev.arrivalMin)}-${formatMinutes(ev.departureMin)} (dur ${s.durationMin}m, transit ${s.transitFromPrevMin}m, open ${formatMinutes(s.openMin)}-${formatMinutes(s.closeMin)}) | ${flags} | status:${ev.status}`;
  });

  const conflictLines =
    evaluation.conflicts.length > 0
      ? evaluation.conflicts.map((c) => `- [${c.severity.toUpperCase()}] ${c.message}`).join('\n')
      : '- None (all stops verified)';

  return [
    `Trip: ${trip.title} (${trip.city}) on ${trip.dateIso} (${trip.dayOfWeek})`,
    `Start: ${formatMinutes(trip.startTimeMin)} | Return Deadline: ${trip.returnDeadlineLabel} (${formatMinutes(trip.returnDeadlineMin)}) | Margin: ${evaluation.returnDeadlineMarginMin} min`,
    `Traveler Profile: ${trip.travelerProfile.label} (seniors=${trip.travelerProfile.hasSeniors}, stepFree=${trip.travelerProfile.needsWheelchairAccess}, lowWalk=${trip.travelerProfile.prefersLowWalking})`,
    `Stops:\n${stopLines.join('\n')}`,
    `Deterministic Conflicts:\n${conflictLines}`,
  ].join('\n');
}

export function buildConciergePrompt(trip: Trip, evalResult: ScheduleEvaluation, userPrompt: string): string {
  return [
    'You are LvSyn Hybrid Trip Companion, an offline-capable concierge helping travelers during active transit.',
    'Keep the response concise, practical, and tailored to the traveler profile. Use exact stop names and computed times.',
    '',
    buildTripContextBlock(trip, evalResult),
    '',
    `Traveler request: ${userPrompt}`,
  ].join('\n');
}

export function buildPrivacyVaultPrompt(trip: Trip, userPrompt: string): string {
  return [
    'You are running strictly ON-DEVICE inside Chrome Gemini Nano with zero cloud transmission.',
    'Generate a helpful, compassionate travel reminder checklist honoring the private traveler notes below.',
    '',
    `Trip: ${trip.title} (${trip.dayOfWeek})`,
    `Private Traveler Notes (strictly local): ${trip.privateNotes}`,
    `Task: ${userPrompt}`,
  ].join('\n');
}

export function buildSignVisionPrompt(trip: Trip, userPrompt: string): string {
  return [
    'Analyze this travel venue sign, timetable, or menu photo for the active trip.',
    'Extract: (1) Opening hours & closed days, (2) Accessibility / stairs / step-free notes, (3) Any immediate conflict with the itinerary below.',
    '',
    `Active Trip: ${trip.title} on ${trip.dayOfWeek}, return deadline ${trip.returnDeadlineLabel}`,
    `Traveler Profile: ${trip.travelerProfile.label}`,
    `Question: ${userPrompt}`,
  ].join('\n');
}

export function buildScheduleOptimizerPrompt(
  trip: Trip,
  evalResult: ScheduleEvaluation,
  userPrompt: string
): string {
  return [
    'You are the LvSyn Hybrid Schedule Optimizer.',
    'Explain clearly how to resolve every schedule conflict and accessibility issue, THEN output a JSON fenced block containing an array of deterministic patchOps.',
    'Allowed op schemas:',
    '1. {"op":"replace_stop","stopId":"<existingId>","replacement":{"name":"...","category":"...","durationMin":75,"transitFromPrevMin":25,"openMin":570,"closeMin":1050,"closedDays":["Wed"],"indoor":true,"wheelchairFriendly":true,"walkingBurden":"low","notes":"..."}}',
    '2. {"op":"update_duration","stopId":"<existingId>","durationMin":75}',
    '3. {"op":"shift_start_time","startTimeMin":525}',
    '4. {"op":"reorder_stops","orderedStopIds":["id1","id2"]}',
    '',
    buildTripContextBlock(trip, evalResult),
    '',
    `Goal: ${userPrompt}`,
  ].join('\n');
}
