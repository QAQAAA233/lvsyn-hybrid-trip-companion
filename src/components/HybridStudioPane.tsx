import { useState } from 'react';
import { InferenceSource } from 'firebase/ai';
import {
  Camera,
  Check,
  Cloud,
  Clock,
  Cpu,
  Lock,
  Send,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { stripJsonBlocksForDisplay, type TaskKind, type TripProposal } from '../domain/proposal';
import { formatMinutes, type Trip } from '../domain/trip';

interface HybridStudioPaneProps {
  trip: Trip;
  activeTab: TaskKind;
  onSelectTab: (tab: TaskKind) => void;
  onUpdatePrivateNotes: (notes: string) => void;
  onRunTask: (args: {
    taskKind: TaskKind;
    userPrompt: string;
    imageAttachment?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      previewUrl: string;
      label: string;
    };
  }) => Promise<void>;
  isRunning: boolean;
  proposals: TripProposal[];
  onKeepProposal: (proposalId: string) => void;
  onDiscardProposal: (proposalId: string) => void;
}

const CONCIERGE_PROMPTS = [
  'Summarize this afternoon for my senior parents and flag any steep walking.',
  'Create an offline pocket transit briefing with key departure times.',
  'Which stop is most likely to cause fatigue or tight timing today?',
];

const BASE_URL = import.meta.env.BASE_URL || './';

const SAMPLE_SIGNS = [
  {
    id: 'kyoto-sign',
    label: 'Kyoto Teahouse Notice (PNG)',
    path: `${BASE_URL}samples/kyoto-teahouse-sign.png`,
    prompt: 'Check opening hours, closed days, and step-free access from this venue sign.',
  },
  {
    id: 'alpine-sign',
    label: 'Alpine Cable Car Timetable (PNG)',
    path: `${BASE_URL}samples/alpine-cablecar-notice.png`,
    prompt: 'Extract last descent time and weather/maintenance warnings from this station sign.',
  },
];

async function urlToAttachment(
  url: string,
  label: string
): Promise<{
  base64Data: string;
  mimeType: 'image/png' | 'image/jpeg';
  previewUrl: string;
  label: string;
}> {
  const res = await fetch(url);
  const blob = await res.blob();
  const mimeType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image sample'));
    reader.readAsDataURL(blob);
  });
  return {
    base64Data: dataUrl.split(',')[1] || '',
    mimeType,
    previewUrl: dataUrl,
    label,
  };
}

export function HybridStudioPane({
  trip,
  activeTab,
  onSelectTab,
  onUpdatePrivateNotes,
  onRunTask,
  isRunning,
  proposals,
  onKeepProposal,
  onDiscardProposal,
}: HybridStudioPaneProps) {
  const [conciergeInput, setConciergeInput] = useState(CONCIERGE_PROMPTS[0]);
  const [privacyInput, setPrivacyInput] = useState(
    'Generate a calm private care & medication checklist synchronized with today’s stops.'
  );
  const [visionInput, setVisionInput] = useState(SAMPLE_SIGNS[0].prompt);
  const [optimizerInput, setOptimizerInput] = useState(
    'Resolve every closed-day or deadline conflict while keeping walking burden low for seniors.'
  );
  const [selectedImage, setSelectedImage] = useState<{
    base64Data: string;
    mimeType: 'image/png' | 'image/jpeg';
    previewUrl: string;
    label: string;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    setSelectedImage({
      base64Data: dataUrl.split(',')[1] || '',
      mimeType,
      previewUrl: dataUrl,
      label: file.name,
    });
  };

  const handlePickSampleSign = async (sample: (typeof SAMPLE_SIGNS)[number]) => {
    const attachment = await urlToAttachment(sample.path, sample.label);
    setSelectedImage(attachment);
    setVisionInput(sample.prompt);
  };

  const tabs: Array<{ id: TaskKind; label: string; badge: string; icon: React.ReactNode }> = [
    {
      id: 'concierge',
      label: 'Concierge',
      badge: 'Hybrid',
      icon: <Sparkles className="h-3.5 w-3.5" />,
    },
    {
      id: 'privacy_vault',
      label: 'Privacy Vault',
      badge: 'On-Device Only',
      icon: <Lock className="h-3.5 w-3.5" />,
    },
    {
      id: 'sign_vision',
      label: 'Sign Vision',
      badge: 'Multimodal',
      icon: <Camera className="h-3.5 w-3.5" />,
    },
    {
      id: 'schedule_optimize',
      label: 'Optimizer',
      badge: 'Keep / Discard',
      icon: <Wrench className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Hybrid AI Studio &amp; Verification
          </h2>
          <p className="text-xs text-stone-500">
            Every run executes through Firebase AI Logic and reports verified{' '}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">inferenceSource</code>
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`tab-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950'
                  : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {tab.icon}
                <span>{tab.label}</span>
              </div>
              <span className="text-[10px] font-medium text-stone-500">{tab.badge}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Controls */}
      {activeTab === 'concierge' && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {CONCIERGE_PROMPTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setConciergeInput(preset)}
                className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition hover:border-emerald-400 hover:text-emerald-800"
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            data-testid="concierge-prompt-input"
            value={conciergeInput}
            onChange={(e) => setConciergeInput(e.target.value)}
            placeholder="Ask about your trip on this device; cloud requires an explicit mode selection."
            className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900 outline-none focus:border-emerald-500"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">
              Respects active Mode selector (default: <code>PREFER_ON_DEVICE</code>)
            </span>
            <button
              type="button"
              disabled={isRunning || !conciergeInput.trim()}
              data-testid="run-concierge-btn"
              onClick={() =>
                onRunTask({ taskKind: 'concierge', userPrompt: conciergeInput.trim() })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run Hybrid Concierge'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'privacy_vault' && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">Strict On-Device Privacy Shield (ONLY_ON_DEVICE)</p>
              <p className="text-[11px] text-stone-600">
                Forces <code>InferenceMode.ONLY_ON_DEVICE</code>. If Gemini Nano is unavailable,
                execution aborts locally with <strong>0 bytes</strong> sent to cloud servers.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-stone-700">
              Private Medical / Mobility / Room PIN Notes (never uploaded)
            </label>
            <textarea
              rows={2}
              value={trip.privateNotes}
              onChange={(e) => onUpdatePrivateNotes(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={privacyInput}
              onChange={(e) => setPrivacyInput(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={isRunning}
              data-testid="run-privacy-btn"
              onClick={() =>
                onRunTask({ taskKind: 'privacy_vault', userPrompt: privacyInput.trim() })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run Locally Only'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'sign_vision' && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_SIGNS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                data-testid={`sample-${sample.id}`}
                onClick={() => handlePickSampleSign(sample)}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-emerald-500 hover:text-emerald-800"
              >
                Use {sample.label}
              </button>
            ))}
            <label className="cursor-pointer rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-emerald-500">
              Upload PNG / JPEG
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {selectedImage && (
            <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2">
              <img
                src={selectedImage.previewUrl}
                alt={selectedImage.label}
                className="h-16 w-24 rounded border border-stone-200 object-cover"
              />
              <div className="text-xs">
                <p className="font-semibold text-stone-800">{selectedImage.label}</p>
                <p className="text-[11px] text-stone-500">
                  Attached as multimodal <code>inlineData</code> ({selectedImage.mimeType})
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={visionInput}
              onChange={(e) => setVisionInput(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={isRunning || !selectedImage}
              data-testid="run-vision-btn"
              onClick={async () => {
                if (!selectedImage) return;
                await onRunTask({
                  taskKind: 'sign_vision',
                  userPrompt: visionInput.trim(),
                  imageAttachment: selectedImage,
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {isRunning ? 'Analyzing...' : 'Analyze Sign Image'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'schedule_optimize' && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3.5">
          <p className="text-xs text-stone-700">
            AI proposes structured <code>patchOps</code>; the deterministic schedule engine previews
            exact arrival times &amp; conflict resolution before you click <strong>Keep</strong> or{' '}
            <strong>Discard</strong>.
          </p>
          <textarea
            rows={2}
            value={optimizerInput}
            onChange={(e) => setOptimizerInput(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900 outline-none focus:border-blue-500"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isRunning || !optimizerInput.trim()}
              data-testid="run-optimizer-btn"
              onClick={() =>
                onRunTask({ taskKind: 'schedule_optimize', userPrompt: optimizerInput.trim() })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Wrench className="h-3.5 w-3.5" />
              {isRunning ? 'Optimizing...' : 'Fix Conflicts & Catch Return Train'}
            </button>
          </div>
        </div>
      )}

      {/* Proposal Cards Feed */}
      <div className="space-y-3" data-testid="proposal-feed">
        {proposals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500">
            Run a task to see where the model actually ran. The timeline remains editable
            on this device without AI or cloud access.
          </div>
        ) : (
          proposals.map((p) => {
            const source = p.telemetry.actualSource;
            const completedBySdk = p.telemetry.sourceEvidence === 'sdk_terminal_response' && Boolean(p.responseText.trim());
            const isOnDevice = completedBySdk && source === InferenceSource.ON_DEVICE;
            const isCloud = completedBySdk && source === InferenceSource.IN_CLOUD;
            const isEmulator = completedBySdk && source === 'local_emulator';
            const isBlocked = source === 'blocked_offline_privacy';
            const isError = p.status === 'error';
            const sourceBadge = (() => {
              if (p.status === 'streaming') return {
                label: 'RUNNING · Source not yet confirmed',
                cls: 'border-stone-300 bg-stone-100 text-stone-900',
                icon: <Clock className="h-3.5 w-3.5" />,
              };
              if (source === 'source_unverified') return {
                label: 'SOURCE UNVERIFIED · Result not used',
                cls: 'border-amber-300 bg-amber-100 text-amber-900',
                icon: <ShieldAlert className="h-3.5 w-3.5" />,
              };
              if (isBlocked) return {
                label: 'BLOCKED BEFORE DISPATCH · Privacy Shield (0 bytes sent)',
                cls: 'border-amber-300 bg-amber-100 text-amber-900',
                icon: <ShieldAlert className="h-3.5 w-3.5" />,
              };
              if (isError) return {
                label: 'NO COMPLETED MODEL RESULT',
                cls: 'border-rose-300 bg-rose-100 text-rose-900',
                icon: <X className="h-3.5 w-3.5" />,
              };
              if (isOnDevice) return {
                label: 'ON-DEVICE · Gemini Nano',
                cls: 'border-emerald-300 bg-emerald-100 text-emerald-900',
                icon: <Cpu className="h-3.5 w-3.5" />,
              };
              if (isEmulator) return {
                label: 'LOCAL EMULATOR · Not Firebase cloud',
                cls: 'border-stone-300 bg-stone-100 text-stone-900',
                icon: <Cpu className="h-3.5 w-3.5" />,
              };
              return {
                label: isCloud ? 'IN-CLOUD · Gemini' : 'SOURCE UNVERIFIED · Result not used',
                cls: isCloud ? 'border-blue-300 bg-blue-100 text-blue-900' :
                  'border-amber-300 bg-amber-100 text-amber-900',
                icon: isCloud ? <Cloud className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />,
              };
            })();
            const recoveryByCode = new Map<string, string>(Object.entries({
                             REQ211_DAILY_ATTEMPTS_EXHAUSTED: 'The local daily cloud allowance is used. No App Check or model request was started. Use the local timeline.',
               REQ211_DAILY_BUDGET_UNAVAILABLE: 'The app cannot verify a persistent local attempt count. Cloud was not started. Use the local timeline.',
               REQ211_CLOUD_BUSY: 'A cloud request is already in progress. No duplicate cloud request or automatic retry was started.',
               REQ211_CLOUD_QUOTA_STOP: 'Cloud quota was unavailable. This request was not retried.',
              REQ211_CLOUD_OFFLINE_STOP: 'This device is offline. No cloud request was started.',
              REQ211_APP_CHECK_UNAVAILABLE: 'Approved cloud access is unavailable in this build.',
              REQ211_CLOUD_PERMISSION_STOP: 'Cloud access was denied. This request was not retried.',
              REQ211_INFERENCE_SOURCE_UNVERIFIED: 'The model did not confirm where it ran. Its output was discarded.',
              REQ211_RUNTIME_NOT_READY: 'The AI service did not start. Run again to retry the local setup, or use the local timeline.',
              REQ211_TERMINAL_TEXT_MISSING: 'The SDK completed without a usable reply. No provider result was recorded. You can run again.',
              REQ211_NATIVE_TIME_LIMIT: 'The device model did not finish within 30 seconds. No partial result was used. You can run again after it stops.',
              REQ211_NATIVE_DRAINING: 'The previous device request is still stopping. No second model request was started.',
            }));
            const recoveryText = recoveryByCode.get(p.errorMessage ?? '') ||
              (isBlocked ? 'Gemini Nano is unavailable. The request stopped before any model call.' :
                'The AI request stopped without a completed result.');

            const cleanBody = stripJsonBlocksForDisplay(p.responseText);
            const mayApply = (isOnDevice || isCloud || isEmulator) && Boolean(p.responseText.trim());

            return (
              <article
                key={p.id}
                data-testid={`proposal-card-${p.kind}`}
                className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                  <span
                    data-testid="proposal-source-badge"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${sourceBadge.cls}`}
                  >
                    {sourceBadge.icon}
                    {sourceBadge.label}
                  </span>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 tabular-nums">
                    <span>{p.telemetry.onlineAtStart ? 'Online' : 'Offline'}</span>
                    <span>·</span>
                    <span>
                      TTFT {p.telemetry.ttftMs !== null ? `${p.telemetry.ttftMs}ms` : '—'}
                    </span>
                    <span>·</span>
                    <span>Total {p.telemetry.totalMs}ms</span>
                    <span>·</span>
                    <span className="font-semibold text-stone-700">
                      {!isError && p.status !== 'streaming' && isOnDevice ? 'Local inference' :
                        !isError && p.status !== 'streaming' && isCloud ? 'Cloud inference' :
                        !isError && p.status !== 'streaming' && isEmulator ? 'Emulated response' : 'No source claim'}
                    </span>
                  </div>
                </div>

                {p.status === 'error' ? (
                  <div className="mt-2.5 space-y-1 text-xs text-stone-700" role="status">
                    <p className="font-medium text-rose-800">{recoveryText}</p>
                    <p>No changes from this request were applied.</p>
                    <a href="#local-itinerary" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">
                      Continue in the local timeline
                    </a>
                  </div>
                ) : (
                  <div className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-stone-800">
                    {cleanBody || (p.status === 'streaming' ? 'Streaming response...' : '')}
                  </div>
                )}

                {mayApply && p.patchOps.length > 0 && p.diffSummary && (
                  <div
                    data-testid="deterministic-diff-card"
                    className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-stone-900">
                        Deterministic Verification Preview ({p.patchOps.length} patch ops)
                      </span>
                      <span className="font-semibold tabular-nums text-emerald-700">
                        Conflicts: {p.diffSummary.beforeErrors} → {p.diffSummary.afterErrors} ·
                        Buffer:{' '}
                        {p.diffSummary.beforeMarginMin >= 0
                          ? `+${p.diffSummary.beforeMarginMin}m`
                          : `${p.diffSummary.beforeMarginMin}m`}{' '}
                        →{' '}
                        {p.diffSummary.afterMarginMin >= 0
                          ? `+${p.diffSummary.afterMarginMin}m`
                          : `${p.diffSummary.afterMarginMin}m`}
                      </span>
                    </div>

                    {p.previewEvaluation && (
                      <p className="mt-1 text-[11px] text-stone-600">
                        Projected finish: {formatMinutes(p.previewEvaluation.totalEndMin)} (
                        {p.previewEvaluation.isValid
                          ? 'All hard conflicts resolved'
                          : `${p.previewEvaluation.errorCount} hard conflicts remain`}
                        )
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center gap-2">
                      {p.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            data-testid="keep-proposal-btn"
                            onClick={() => onKeepProposal(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Keep Changes
                          </button>
                          <button
                            type="button"
                            data-testid="discard-proposal-btn"
                            onClick={() => onDiscardProposal(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                          >
                            <X className="h-3.5 w-3.5" />
                            Discard
                          </button>
                        </>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            p.status === 'kept'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {p.status === 'kept' ? 'Kept & Applied to Timeline' : 'Discarded'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
