import { useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Clock,
  Footprints,
  HardDrive,
  MapPin,
  Minus,
  Plus,
  Trash2,
  Train,
} from 'lucide-react';
import type { ScheduleEvaluation } from '../domain/scheduleEngine';
import {
  formatMinutes,
  parseTimeToMinutes,
  type DayOfWeek,
  type Trip,
  type TripStop,
  type WalkingBurden,
} from '../domain/trip';
import type { Tone } from './sourcePresentation';

interface ItineraryPaneProps {
  trip: Trip;
  evaluation: ScheduleEvaluation;
  syncStatus: 'local_only' | 'firestore_synced' | 'firestore_offline_queued';
  localSaveStatus?: 'ready' | 'saved' | 'volatile';
  onRetryLocalSave?: () => void;
  onChangeStartTime: (startTimeMin: number) => void;
  onChangeDayOfWeek: (day: DayOfWeek) => void;
  onMoveStop: (stopId: string, direction: -1 | 1) => void;
  onAdjustDuration: (stopId: string, deltaMin: number) => void;
  onDeleteStop: (stopId: string) => void;
  onAddStop: (stop: TripStop) => void;
}

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ItineraryPane({
  trip,
  evaluation,
  syncStatus,
  localSaveStatus = 'ready',
  onRetryLocalSave,
  onChangeStartTime,
  onChangeDayOfWeek,
  onMoveStop,
  onAdjustDuration,
  onDeleteStop,
  onAddStop,
}: ItineraryPaneProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Museum');
  const [newDuration, setNewDuration] = useState(60);
  const [newTransit, setNewTransit] = useState(20);
  const [newOpen, setNewOpen] = useState('09:30');
  const [newClose, setNewClose] = useState('17:30');
  const [newWheelchair, setNewWheelchair] = useState(true);
  const [newWalking, setNewWalking] = useState<WalkingBurden>('low');

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const openMin = parseTimeToMinutes(newOpen) ?? 540;
    const closeMin = parseTimeToMinutes(newClose) ?? 1080;

    onAddStop({
      id: `stop-${Date.now().toString(36)}`,
      name: newName.trim(),
      category: newCategory.trim() || 'Stop',
      durationMin: Math.max(15, newDuration),
      transitFromPrevMin: Math.max(0, newTransit),
      openMin,
      closeMin,
      closedDays: [],
      indoor: true,
      wheelchairFriendly: newWheelchair,
      walkingBurden: newWalking,
      notes: 'Added by traveler.',
    });
    setNewName('');
    setShowAddForm(false);
  };

  const bannerTone: Tone = evaluation.errorCount > 0 ? 'danger' : evaluation.warningCount > 0 ? 'guard' : 'ok';
  const stepBtn =
    'inline-flex h-9 items-center justify-center gap-1 px-2.5 text-meta font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent sm:h-8';

  return (
    <section className="card flex flex-col gap-5 p-4 sm:p-6">
      {/* Trip heading */}
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta font-medium text-ink-3">
            <MapPin className="h-3.5 w-3.5 text-device" />
            <span>{trip.city}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{trip.dateIso}</span>
            <span className="chip tone-neutral ml-1 min-h-5 py-0">
              {syncStatus === 'firestore_synced'
                ? 'Firestore Synced'
                : syncStatus === 'firestore_offline_queued'
                  ? 'Firestore Offline Cache'
                  : 'Local itinerary'}
            </span>
          </div>
          <h2 className="mt-1.5 font-display text-display font-bold tracking-tight text-ink">{trip.title}</h2>
          <p className="mt-0.5 text-body text-ink-3">{trip.travelerProfile.label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="chip tone-neutral min-h-9 rounded-[var(--radius-control)] px-3">
            <Calendar className="h-4 w-4 text-ink-3" />
            <select
              aria-label="Trip day of week"
              value={trip.dayOfWeek}
              onChange={(e) => onChangeDayOfWeek(e.target.value as DayOfWeek)}
              className="trip-native-select bg-transparent font-semibold text-ink outline-none"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="chip tone-neutral min-h-9 rounded-[var(--radius-control)] px-3">
            <Clock className="h-4 w-4 text-ink-3" />
            <span className="font-medium text-ink-3">Start</span>
            <input
              type="time"
              aria-label="Trip start time"
              value={formatMinutes(trip.startTimeMin)}
              onChange={(e) => {
                const m = parseTimeToMinutes(e.target.value);
                if (m !== null) onChangeStartTime(m);
              }}
              className="bg-transparent font-semibold text-ink tabular-nums outline-none"
            />
          </label>

          <div className="chip tone-cloud min-h-9 rounded-[var(--radius-control)] px-3">
            <Train className="h-4 w-4" />
            <span className="tabular-nums">{trip.returnDeadlineLabel}</span>
          </div>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-meta ${
          localSaveStatus === 'volatile' ? 'border border-guard-line bg-guard-soft text-guard-strong' : 'bg-surface-2 text-ink-3'}`}>
          <p className="m-0 inline-flex items-center gap-2" role="status" aria-atomic="true" data-testid="itinerary-local-save">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
            {localSaveStatus === 'volatile'
              ? 'Local save was not confirmed. Keep this tab open to retain your edits, then retry local save.'
              : localSaveStatus === 'saved'
                ? 'Saved on this browser. Nothing was sent to the cloud.'
                : 'Editing does not require a network connection.'}
          </p>
          {localSaveStatus === 'volatile' && onRetryLocalSave && (
            <button type="button" onClick={onRetryLocalSave} className="btn btn-outline min-h-11">
              Retry local save
            </button>
          )}
        </div>
      </div>

      {/* Deterministic Schedule Verification Banner */}
      <div
        data-testid="schedule-verification-banner"
        className={`rounded-[var(--radius-panel)] border-l-4 px-4 py-3.5 text-body tone-${bannerTone}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="flex items-start gap-2 font-semibold">
            {evaluation.errorCount > 0 || evaluation.warningCount > 0 ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {evaluation.errorCount > 0
                ? `${evaluation.errorCount} hard conflict${evaluation.errorCount > 1 ? 's' : ''} + ${evaluation.warningCount} warning${evaluation.warningCount === 1 ? '' : 's'} detected by deterministic schedule engine`
                : evaluation.warningCount > 0
                  ? `0 hard conflicts · ${evaluation.warningCount} accessibility/buffer warning`
                  : `All ${evaluation.evaluatedStops.length} stops verified`}
            </span>
          </div>
          <span className="shrink-0 pl-6 font-bold tabular-nums sm:pl-0">
            Finish {formatMinutes(evaluation.totalEndMin)} (
            {evaluation.returnDeadlineMarginMin >= 0
              ? `+${evaluation.returnDeadlineMarginMin}m buffer`
              : `${evaluation.returnDeadlineMarginMin}m past deadline`}
            )
          </span>
        </div>

        {evaluation.conflicts.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 pl-6 text-meta">
            {evaluation.conflicts.map((c, idx) => (
              <li key={`${c.stopId}-${c.code}-${idx}`} className="flex gap-2">
                <span className={`chip min-h-5 shrink-0 self-start py-0 text-[0.6875rem] uppercase tracking-wide ${c.severity === 'error' ? 'tone-danger' : 'tone-guard'}`}>
                  {c.severity}:
                </span>
                <span className="pt-0.5">{c.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeline Stops */}
      <ol className="relative m-0 list-none p-0" data-testid="timeline-stops">
        {evaluation.evaluatedStops.map((ev, idx) => {
          const { stop } = ev;
          const badge: { label: string; tone: Tone } = (() => {
            if (ev.status === 'closed') return { label: 'Closed / Overrun', tone: 'danger' };
            if (ev.status === 'past_deadline') return { label: 'Misses Deadline', tone: 'danger' };
            if (ev.status === 'tight') return { label: 'Caution', tone: 'guard' };
            return { label: 'On Time', tone: 'ok' };
          })();
          const isLast = idx === evaluation.evaluatedStops.length - 1;
          const accent = badge.tone === 'danger' ? 'border-l-danger' : badge.tone === 'guard' ? 'border-l-guard' : 'border-l-transparent';

          return (
            <li key={stop.id} className="relative grid grid-cols-[2rem_1fr] gap-x-3 sm:grid-cols-[2.5rem_1fr] sm:gap-x-4">
              {/* Rail */}
              <div className="relative flex justify-center">
                {!isLast && <span aria-hidden="true" className="absolute top-9 bottom-0 w-0.5 rounded bg-line" />}
                <span className={`relative z-10 mt-3.5 flex h-8 w-8 items-center justify-center rounded-full text-meta font-bold text-white tabular-nums shadow-[var(--shadow-raised)] ${
                  badge.tone === 'danger' ? 'bg-danger' : badge.tone === 'guard' ? 'bg-guard' : 'bg-ink'}`}>
                  {idx + 1}
                </span>
              </div>

              <div className="pb-4">
                {idx > 0 && (
                  <div className="-mt-1 mb-2 inline-flex items-center gap-1.5 text-meta text-ink-3 tabular-nums">
                    <Footprints className="h-3.5 w-3.5" />
                    <span>Transit {stop.transitFromPrevMin}m</span>
                  </div>
                )}
                <div
                  data-testid={`stop-card-${stop.id}`}
                  className={`rounded-[var(--radius-panel)] border border-line border-l-4 ${accent} bg-surface p-3.5 transition hover:border-line-strong hover:shadow-[var(--shadow-raised)] sm:p-4`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
                    <div className="min-w-0">
                      <div className="font-display text-title font-bold tabular-nums tracking-tight text-ink">
                        {formatMinutes(ev.arrivalMin)} – {formatMinutes(ev.departureMin)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold text-ink">{stop.name}</span>
                        <span className="chip tone-neutral min-h-5 py-0">{stop.category}</span>
                        <span className={`chip min-h-5 py-0 tone-${badge.tone}`}>{badge.label}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-3 tabular-nums">
                        {idx === 0 && <span>Transit {stop.transitFromPrevMin}m</span>}
                        <span>
                          Open {formatMinutes(stop.openMin)}–{formatMinutes(stop.closeMin)}
                          {stop.closedDays.length > 0 ? ` (Closed ${stop.closedDays.join(', ')})` : ''}
                        </span>
                        {ev.waitForOpeningMin > 0 && (
                          <span className="font-semibold text-guard-strong">
                            Wait {ev.waitForOpeningMin}m for opening
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-surface">
                        <button
                          type="button"
                          aria-label={`Shorten ${stop.name} by 15 min`}
                          onClick={() => onAdjustDuration(stop.id, -15)}
                          className={stepBtn}
                        >
                          <Minus className="h-3.5 w-3.5" /> 15m
                        </button>
                        <span className="inline-flex min-w-12 items-center justify-center border-x border-line bg-surface-2 px-2 text-meta font-bold tabular-nums text-ink">
                          {stop.durationMin}m
                        </span>
                        <button
                          type="button"
                          aria-label={`Extend ${stop.name} by 15 min`}
                          onClick={() => onAdjustDuration(stop.id, 15)}
                          className={stepBtn}
                        >
                          <Plus className="h-3.5 w-3.5" /> 15m
                        </button>
                      </div>
                      <div className="inline-flex items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-surface">
                        <button
                          type="button"
                          aria-label={`Move ${stop.name} up`}
                          disabled={idx === 0}
                          onClick={() => onMoveStop(stop.id, -1)}
                          className={`${stepBtn} w-9 px-0 sm:w-8`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${stop.name} down`}
                          disabled={isLast}
                          onClick={() => onMoveStop(stop.id, 1)}
                          className={`${stepBtn} w-9 border-l border-line px-0 sm:w-8`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${stop.name}`}
                        onClick={() => onDeleteStop(stop.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-ink-3 transition hover:bg-danger-soft hover:text-danger sm:h-8 sm:w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-meta">
                    <span className={`chip min-h-6 py-0 ${stop.wheelchairFriendly ? 'tone-device' : 'tone-guard'}`}>
                      <Accessibility className="h-3.5 w-3.5" />
                      {stop.wheelchairFriendly ? 'Step-Free' : 'Stairs / Limited Access'}
                    </span>
                    <span className="chip tone-neutral min-h-6 py-0">
                      <Footprints className="h-3.5 w-3.5" />
                      Walking: {stop.walkingBurden}
                    </span>
                    <span className="chip tone-neutral min-h-6 py-0">
                      {stop.indoor ? 'Indoor' : 'Outdoor'}
                    </span>
                    {stop.notes && <span className="basis-full pt-1 text-ink-3 sm:basis-auto sm:pt-0 sm:pl-1">{stop.notes}</span>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Add Stop Inline Drawer */}
      <div>
        {!showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface-2 px-3 py-3 text-body font-semibold text-ink-2 transition hover:border-device hover:bg-device-soft hover:text-device-strong"
          >
            <Plus className="h-4 w-4" />
            Add Stop to Itinerary
          </button>
        ) : (
          <form
            onSubmit={handleAddSubmit}
            className="panel grid grid-cols-1 gap-2.5 p-3.5 text-meta sm:grid-cols-3"
          >
            <input
              type="text"
              required
              placeholder="Venue / Stop name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="field sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="field"
            />
            <label className="field flex items-center justify-between gap-2">
              <span className="text-ink-3">Stay (min)</span>
              <input
                type="number"
                min={15}
                max={360}
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-16 bg-transparent text-right font-semibold outline-none"
              />
            </label>
            <label className="field flex items-center justify-between gap-2">
              <span className="text-ink-3">Transit (min)</span>
              <input
                type="number"
                min={0}
                max={180}
                value={newTransit}
                onChange={(e) => setNewTransit(Number(e.target.value))}
                className="w-16 bg-transparent text-right font-semibold outline-none"
              />
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={newOpen}
                onChange={(e) => setNewOpen(e.target.value)}
                className="field px-2"
              />
              <span className="text-ink-3">–</span>
              <input
                type="time"
                value={newClose}
                onChange={(e) => setNewClose(e.target.value)}
                className="field px-2"
              />
            </div>
            <label className="flex items-center gap-2 px-1 text-body text-ink-2">
              <input
                type="checkbox"
                checked={newWheelchair}
                onChange={(e) => setNewWheelchair(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-device)]"
              />
              Step-free access
            </label>
            <select
              value={newWalking}
              onChange={(e) => setNewWalking(e.target.value as WalkingBurden)}
              className="field"
            >
              <option value="low">Low walking</option>
              <option value="moderate">Moderate walking</option>
              <option value="high">High walking</option>
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Add
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
