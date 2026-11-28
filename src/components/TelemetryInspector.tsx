import { InferenceSource } from 'firebase/ai';
import { Activity, Download } from 'lucide-react';
import type { InferenceTelemetry } from '../domain/proposal';
import { toneForSource, type Tone } from './sourcePresentation';

interface TelemetryInspectorProps {
  entries: InferenceTelemetry[];
}

export function TelemetryInspector({ entries }: TelemetryInspectorProps) {
  const wasConfirmed = (entry: InferenceTelemetry) => entry.sourceEvidence === 'sdk_terminal_response';
  const onDeviceRuns = entries.filter((e) => wasConfirmed(e) && e.actualSource === InferenceSource.ON_DEVICE);
  const inCloudRuns = entries.filter((e) => wasConfirmed(e) && e.actualSource === InferenceSource.IN_CLOUD);
  const sourceForDisplay = (e: InferenceTelemetry) =>
    !wasConfirmed(e) && (e.actualSource === InferenceSource.ON_DEVICE ||
      e.actualSource === InferenceSource.IN_CLOUD || e.actualSource === 'local_emulator') ? 'source_unverified' : e.actualSource;

  const avgLocalMs =
    onDeviceRuns.length > 0
      ? Math.round(
          onDeviceRuns.reduce((sum, e) => sum + e.totalMs, 0) / onDeviceRuns.length
        )
      : null;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lvsyn-hybrid-telemetry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      data-testid="telemetry-inspector"
      className="card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-device">
            <Activity className="h-4 w-4" />
          </span>
          <h3 className="font-display text-title font-bold tracking-tight text-ink">
            Live Hybrid Inference Telemetry
          </h3>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-outline"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong px-4 py-5 text-center text-body text-ink-3">
          No model has completed a run. When a route is available, responses report{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-meta text-ink-2">inferenceSource</code>, latency, and network activity.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat tone="device" label="On-Device Runs" value={String(onDeviceRuns.length)} />
          <Stat tone="cloud" label="Confirmed Cloud Runs" value={String(inCloudRuns.length)} />
          <Stat tone="neutral" label="Avg Local Latency" value={avgLocalMs !== null ? `${avgLocalMs} ms` : '—'} />
          <Stat tone="guard" label="Source Unverified" value={String(entries.filter((e) => sourceForDisplay(e) === 'source_unverified').length)} />
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-panel)] border border-line">
          <table className="w-full text-left text-meta">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-ink-3 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold [&>th]:whitespace-nowrap">
                <th className="py-1.5 pr-3">Task</th>
                <th className="py-1.5 pr-3">Mode</th>
                <th className="py-1.5 pr-3">inferenceSource</th>
                <th className="py-1.5 pr-3">Network</th>
                <th className="py-1.5 pr-3">App Check</th>
                <th className="py-1.5 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums [&_td]:px-3 [&_td]:py-2.5 [&_td]:whitespace-nowrap">
              {entries.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-3 font-medium text-ink">{e.taskKind}</td>
                  <td className="py-1.5 pr-3 text-ink-3">{e.requestedMode}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`chip min-h-5 py-0 font-mono tone-${toneForSource(sourceForDisplay(e))}`}
                    >
                      {sourceForDisplay(e)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-3">
                    {e.onlineAtStart ? 'Online' : 'Offline'}
                  </td>
                  <td className="py-1.5 pr-3 text-ink-3">{e.appCheckMode}</td>
                  <td className="py-1.5 text-right font-semibold text-ink">
                    {e.totalMs} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <div className={`rounded-[var(--radius-panel)] border px-3 py-2.5 tone-${tone}`}>
      <p className="text-meta font-semibold opacity-90">{label}</p>
      <p className="mt-1 font-display text-display font-bold tabular-nums">{value}</p>
    </div>
  );
}
