import { InferenceSource } from 'firebase/ai';
import { Activity, Download } from 'lucide-react';
import type { InferenceTelemetry } from '../domain/proposal';

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
      className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-stone-900">
            Live Hybrid Inference Telemetry
          </h3>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-stone-500">
          Run any AI task or click Verify On-Device above to inspect live{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">inferenceSource</code>, latency, and network telemetry.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
            <p className="text-[11px] font-medium text-emerald-800">On-Device Runs</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-950">
              {onDeviceRuns.length}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5">
            <p className="text-[11px] font-medium text-blue-800">Confirmed Cloud Runs</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-blue-950">
              {inCloudRuns.length}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
            <p className="text-[11px] font-medium text-stone-600">Avg Local Latency</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-stone-900">
              {avgLocalMs !== null ? `${avgLocalMs} ms` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
            <p className="text-[11px] font-medium text-stone-600">Source Unverified</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-stone-900">
              {entries.filter((e) => sourceForDisplay(e) === 'source_unverified').length}
            </p>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-[11px] text-stone-500">
                <th className="py-1.5 pr-3">Task</th>
                <th className="py-1.5 pr-3">Mode</th>
                <th className="py-1.5 pr-3">inferenceSource</th>
                <th className="py-1.5 pr-3">Network</th>
                <th className="py-1.5 pr-3">App Check</th>
                <th className="py-1.5 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {entries.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-3 font-medium text-stone-800">{e.taskKind}</td>
                  <td className="py-1.5 pr-3 text-stone-600">{e.requestedMode}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        sourceForDisplay(e) === InferenceSource.ON_DEVICE
                          ? 'bg-emerald-100 text-emerald-800'
                          : sourceForDisplay(e) === InferenceSource.IN_CLOUD
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {sourceForDisplay(e)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-stone-600">
                    {e.onlineAtStart ? 'Online' : 'Offline'}
                  </td>
                  <td className="py-1.5 pr-3 text-stone-600">{e.appCheckMode}</td>
                  <td className="py-1.5 text-right font-semibold text-stone-800">
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
