import type { InferenceMode, InferenceSource } from 'firebase/ai';
import type { ScheduleDiffSummary, ScheduleEvaluation, TripPatchOp } from './scheduleEngine';
import type { Trip } from './trip';

export type TaskKind = 'concierge' | 'privacy_vault' | 'sign_vision' | 'schedule_optimize';

export type AppCheckMode =
  | 'recaptcha_enterprise'
  | 'recaptcha_v3'
  | 'debug_token'
  | 'local_emulator_provider'
  | 'unconfigured';

export interface InferenceTelemetry {
  id: string;
  taskKind: TaskKind;
  requestedMode: InferenceMode;
  actualSource: InferenceSource | 'blocked_offline_privacy' | 'error';
  modelLabel: string;
  onlineAtStart: boolean;
  appCheckMode: AppCheckMode;
  ttftMs: number | null;
  totalMs: number;
  estimatedCloudCostUsd: number;
  inputModalities: ('text' | 'image')[];
  timestamp: number;
}

export type ProposalStatus = 'streaming' | 'pending' | 'kept' | 'discarded' | 'error';

export interface TripProposal {
  id: string;
  kind: TaskKind;
  prompt: string;
  responseText: string;
  patchOps: TripPatchOp[];
  previewEvaluation?: ScheduleEvaluation;
  diffSummary?: ScheduleDiffSummary;
  status: ProposalStatus;
  errorMessage?: string;
  telemetry: InferenceTelemetry;
  createdAt: number;
}

const VALID_OPS = new Set([
  'shift_start_time',
  'update_duration',
  'reorder_stops',
  'replace_stop',
  'append_note',
]);

export function extractProposalOps(rawText: string, trip: Trip): TripPatchOp[] {
  const blockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  const validStopIds = new Set(trip.stops.map((s) => s.id));
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.patchOps)
          ? parsed.patchOps
          : null;
      if (!candidates) continue;

      const verified: TripPatchOp[] = [];
      for (const item of candidates) {
        if (!item || typeof item !== 'object' || !VALID_OPS.has(item.op)) continue;

        if (item.op === 'shift_start_time' && typeof item.startTimeMin === 'number') {
          verified.push(item as TripPatchOp);
        } else if (
          item.op === 'update_duration' &&
          typeof item.stopId === 'string' &&
          validStopIds.has(item.stopId) &&
          typeof item.durationMin === 'number'
        ) {
          verified.push(item as TripPatchOp);
        } else if (
          item.op === 'reorder_stops' &&
          Array.isArray(item.orderedStopIds) &&
          item.orderedStopIds.every((id: unknown) => typeof id === 'string' && validStopIds.has(id))
        ) {
          verified.push(item as TripPatchOp);
        } else if (
          item.op === 'replace_stop' &&
          typeof item.stopId === 'string' &&
          validStopIds.has(item.stopId) &&
          item.replacement &&
          typeof item.replacement.name === 'string'
        ) {
          verified.push(item as TripPatchOp);
        } else if (
          item.op === 'append_note' &&
          typeof item.stopId === 'string' &&
          validStopIds.has(item.stopId) &&
          typeof item.note === 'string'
        ) {
          verified.push(item as TripPatchOp);
        }
      }

      if (verified.length > 0) return verified;
    } catch {
      // Ignore malformed JSON blocks and continue scanning remaining fenced blocks
    }
  }

  return [];
}

export function stripJsonBlocksForDisplay(rawText: string): string {
  return rawText.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim();
}
