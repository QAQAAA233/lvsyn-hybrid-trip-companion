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

interface ItineraryPaneProps {
  trip: Trip;
  evaluation: ScheduleEvaluation;
  syncStatus: 'local_only' | 'firestore_synced' | 'firestore_offline_queued';
  localSaveStatus?: 'ready'|'saved'|'volatile';
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
  localSaveStatus='ready',
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

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
        localSaveStatus==='volatile'?'border-amber-300 bg-amber-50 text-amber-950':
          'border-stone-200 bg-stone-50 text-stone-800'}`}>
        <p className="m-0" role="status" aria-atomic="true" data-testid="itinerary-local-save">
          {localSaveStatus==='volatile'
            ? 'Local save was not confirmed. Keep this tab open to retain your edits, then retry local save.'
            : localSaveStatus==='saved'
              ? 'Saved on this browser. Nothing was sent to the cloud.'
              : 'Editing does not require a network connection.'}
        </p>
        {localSaveStatus==='volatile' && onRetryLocalSave && (
          <button type="button" onClick={onRetryLocalSave}
            className="inline-flex min-h-11 items-center rounded-md border border-amber-500 bg-white px-3 font-semibold text-amber-950 focus-visible:outline-2">
            Retry local save
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
            <span>{trip.city}</span>
            <span>·</span>
            <span>{trip.dateIso}</span>
            <span>·</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
              {syncStatus === 'firestore_synced'
                ? 'Firestore Synced'
                : syncStatus === 'firestore_offline_queued'
                  ? 'Firestore Offline Cache'
                  : 'Local itinerary'}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-stone-900">{trip.title}</h2>
          <p className="mt-0.5 text-xs text-stone-600">{trip.travelerProfile.label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-stone-500" />
            <select
              aria-label="Trip day of week"
              value={trip.dayOfWeek}
              onChange={(e) => onChangeDayOfWeek(e.target.value as DayOfWeek)}
              className="bg-transparent font-semibold text-stone-800 outline-none"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
            <Clock className="h-3.5 w-3.5 text-stone-500" />
            <span className="text-stone-500">Start</span>
            <input
              type="time"
              aria-label="Trip start time"
              value={formatMinutes(trip.startTimeMin)}
              onChange={(e) => {
                const m = parseTimeToMinutes(e.target.value);
                if (m !== null) onChangeStartTime(m);
              }}
              className="bg-transparent font-semibold text-stone-800 tabular-nums outline-none"
            />
          </label>

          <div className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-medium text-stone-700">
            <Train className="h-3.5 w-3.5 text-blue-600" />
            <span className="tabular-nums">{trip.returnDeadlineLabel}</span>
          </div>
        </div>
      </div>

      {/* Deterministic Schedule Verification Banner */}
      <div
        data-testid="schedule-verification-banner"
        className={`rounded-xl border px-3.5 py-3 text-xs ${
          evaluation.errorCount > 0
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : evaluation.warningCount > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            {evaluation.errorCount > 0 || evaluation.warningCount > 0 ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>
              {evaluation.errorCount > 0
                ? `${evaluation.errorCount} hard conflict${evaluation.errorCount > 1 ? 's' : ''} + ${evaluation.warningCount} warning${evaluation.warningCount === 1 ? '' : 's'} detected by deterministic schedule engine`
                : evaluation.warningCount > 0
                  ? `0 hard conflicts · ${evaluation.warningCount} accessibility/buffer warning`
                  : `All ${evaluation.evaluatedStops.length} stops verified`}
            </span>
          </div>
          <span className="font-bold tabular-nums">
            Finish {formatMinutes(evaluation.totalEndMin)} (
            {evaluation.returnDeadlineMarginMin >= 0
              ? `+${evaluation.returnDeadlineMarginMin}m buffer`
              : `${evaluation.returnDeadlineMarginMin}m past deadline`}
            )
          </span>
        </div>

        {evaluation.conflicts.length > 0 && (
          <ul className="mt-2 space-y-1 pl-6 text-[11px] list-disc">
            {evaluation.conflicts.map((c, idx) => (
              <li key={`${c.stopId}-${c.code}-${idx}`}>
                <span className="font-semibold uppercase">{c.severity}:</span> {c.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeline Stops */}
      <div className="space-y-3" data-testid="timeline-stops">
        {evaluation.evaluatedStops.map((ev, idx) => {
          const { stop } = ev;
          const badge = (() => {
            if (ev.status === 'closed') {
              return { label: 'Closed / Overrun', cls: 'border-rose-300 bg-rose-100 text-rose-800' };
            }
            if (ev.status === 'past_deadline') {
              return { label: 'Misses Deadline', cls: 'border-rose-300 bg-rose-100 text-rose-800' };
            }
            if (ev.status === 'tight') {
              return { label: 'Caution', cls: 'border-amber-300 bg-amber-100 text-amber-800' };
            }
            return { label: 'On Time', cls: 'border-emerald-300 bg-emerald-100 text-emerald-800' };
          })();

          return (
            <div
              key={stop.id}
              data-testid={`stop-card-${stop.id}`}
              className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 transition hover:border-stone-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white tabular-nums">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-stone-900">{stop.name}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 border border-stone-200">
                        {stop.category}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 tabular-nums">
                      <span className="font-semibold text-stone-800">
                        {formatMinutes(ev.arrivalMin)} – {formatMinutes(ev.departureMin)}
                      </span>
                      <span>Transit {stop.transitFromPrevMin}m</span>
                      <span>
                        Open {formatMinutes(stop.openMin)}–{formatMinutes(stop.closeMin)}
                        {stop.closedDays.length > 0 ? ` (Closed ${stop.closedDays.join(', ')})` : ''}
                      </span>
                      {ev.waitForOpeningMin > 0 && (
                        <span className="text-amber-700 font-medium">
                          Wait {ev.waitForOpeningMin}m for opening
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Shorten ${stop.name} by 15 min`}
                    onClick={() => onAdjustDuration(stop.id, -15)}
                    className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                  >
                    <Minus className="inline h-3 w-3" /> 15m
                  </button>
                  <span className="px-1.5 text-xs font-semibold tabular-nums text-stone-700">
                    {stop.durationMin}m
                  </span>
                  <button
                    type="button"
                    aria-label={`Extend ${stop.name} by 15 min`}
                    onClick={() => onAdjustDuration(stop.id, 15)}
                    className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                  >
                    <Plus className="inline h-3 w-3" /> 15m
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${stop.name} up`}
                    disabled={idx === 0}
                    onClick={() => onMoveStop(stop.id, -1)}
                    className="rounded-md border border-stone-200 bg-white p-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${stop.name} down`}
                    disabled={idx === evaluation.evaluatedStops.length - 1}
                    onClick={() => onMoveStop(stop.id, 1)}
                    className="rounded-md border border-stone-200 bg-white p-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${stop.name}`}
                    onClick={() => onDeleteStop(stop.id)}
                    className="rounded-md border border-stone-200 bg-white p-1 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-stone-600">
                <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 border border-stone-200">
                  <Accessibility className="h-3 w-3 text-emerald-600" />
                  {stop.wheelchairFriendly ? 'Step-Free' : 'Stairs / Limited Access'}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 border border-stone-200">
                  <Footprints className="h-3 w-3 text-stone-500" />
                  Walking: {stop.walkingBurden}
                </span>
                <span className="rounded bg-white px-2 py-0.5 border border-stone-200">
                  {stop.indoor ? 'Indoor' : 'Outdoor'}
                </span>
                {stop.notes && <span className="text-stone-500">{stop.notes}</span>}
              </div>

              {ev.conflicts.length > 0 && (
                <div className="mt-2 pl-8 space-y-0.5">
                  {ev.conflicts.map((c, cIdx) => (
                    <p
                      key={cIdx}
                      className={`text-[11px] font-medium ${
                        c.severity === 'error' ? 'text-rose-700' : 'text-amber-700'
                      }`}
                    >
                      • {c.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Stop Inline Drawer */}
      <div className="pt-1">
        {!showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Stop to Itinerary
          </button>
        ) : (
          <form
            onSubmit={handleAddSubmit}
            className="grid grid-cols-1 gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs sm:grid-cols-3"
          >
            <input
              type="text"
              required
              placeholder="Venue / Stop name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5"
            />
            <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5">
              <span>Stay (min)</span>
              <input
                type="number"
                min={15}
                max={360}
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-16 text-right font-semibold outline-none"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5">
              <span>Transit (min)</span>
              <input
                type="number"
                min={0}
                max={180}
                value={newTransit}
                onChange={(e) => setNewTransit(Number(e.target.value))}
                className="w-16 text-right font-semibold outline-none"
              />
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={newOpen}
                onChange={(e) => setNewOpen(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5"
              />
              <span>–</span>
              <input
                type="time"
                value={newClose}
                onChange={(e) => setNewClose(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5"
              />
            </div>
            <label className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                checked={newWheelchair}
                onChange={(e) => setNewWheelchair(e.target.checked)}
              />
              Step-free access
            </label>
            <select
              value={newWalking}
              onChange={(e) => setNewWalking(e.target.value as WalkingBurden)}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"
            >
              <option value="low">Low walking</option>
              <option value="moderate">Moderate walking</option>
              <option value="high">High walking</option>
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
