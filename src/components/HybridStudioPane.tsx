import { useState } from 'react';
import {
  ArrowRight,
  Ban,
  Camera,
  Check,
  Cloud,
  Cpu,
  Download,
  ImageIcon,
  Layers,
  Lock,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import type { LocalModelAvailability } from '../ai/hybridInferenceService';
import { stripJsonBlocksForDisplay, type TaskKind, type TripProposal } from '../domain/proposal';
import { formatMinutes, type Trip } from '../domain/trip';
import { describeProposalSource, type RouteState, type Tone } from './sourcePresentation';

interface HybridStudioPaneProps {
  trip: Trip;
  activeTab: TaskKind;
  onSelectTab: (tab: TaskKind) => void;
  nanoAvailability: LocalModelAvailability;
  nanoImageAvailability: LocalModelAvailability;
  nanoChecking: boolean;
  canPrepareDevice: boolean;
  canRunDeviceText: boolean;
  canRunDeviceImage: boolean;
  canRunSelectedText: boolean;
  allowDeviceImageInSelectedMode: boolean;
  downloadPercent: number | null;
  nanoInitMessage: string | null;
  debugSdkLogs: boolean;
  onToggleDebugSdkLogs: (enabled: boolean) => void;
  onInitializeNano: () => void;
  onRefreshNano: () => void;
  onVerifyOnDevice: () => void;
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
  nanoAvailability,
  nanoImageAvailability,
  nanoChecking,
  canPrepareDevice,
  canRunDeviceText,
  canRunDeviceImage,
  canRunSelectedText,
  allowDeviceImageInSelectedMode,
  downloadPercent,
  nanoInitMessage,
  debugSdkLogs,
  onToggleDebugSdkLogs,
  onInitializeNano,
  onRefreshNano,
  onVerifyOnDevice,
  onUpdatePrivateNotes,
  onRunTask,
  isRunning,
  proposals,
  onKeepProposal,
  onDiscardProposal,
}: HybridStudioPaneProps) {
  const [conciergeInput, setConciergeInput] = useState(CONCIERGE_PROMPTS[0]);
  const [privacyInput, setPrivacyInput] = useState(
    'Draft a gentle reminder note using my private mobility and room PIN notes.'
  );
  const [visionInput, setVisionInput] = useState(SAMPLE_SIGNS[0].prompt);
  const [selectedImage, setSelectedImage] = useState<{
    base64Data: string;
    mimeType: 'image/png' | 'image/jpeg';
    previewUrl: string;
    label: string;
  } | null>(null);
  const [optimizerInput, setOptimizerInput] = useState(
    'Resolve any venue conflicts or overrun stops so we arrive comfortably before our return train.'
  );

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

  const tabTone: Record<TaskKind, Tone> = {
    concierge: 'cloud',
    privacy_vault: 'device',
    sign_vision: 'neutral',
    schedule_optimize: 'ok',
  };
  const latest = proposals[0];
  const downloading = downloadPercent !== null && downloadPercent < 100;

  return (
    <section className="card flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">Firebase AI Logic · Hybrid inference</p>
          <h2 className="mt-1 font-display text-title font-bold tracking-tight text-ink sm:text-display">
            Hybrid AI Studio &amp; Verification
          </h2>
          <p className="mt-1 text-body text-ink-3">
            Completed model responses show a verified{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-meta text-ink-2">inferenceSource</code>.
            Mode selection is explicit; a local preference does not fall back to cloud.
          </p>
        </div>
        <label className="chip tone-neutral cursor-pointer min-h-8 px-3">
          <input
            type="checkbox"
            data-testid="debug-logs-toggle"
            checked={debugSdkLogs}
            onChange={(e) => onToggleDebugSdkLogs(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-device)]"
          />
          Debug SDK Logs
        </label>
      </div>

      {/* On-Device Proof & Control Strip */}
      <div data-testid="on-device-proof-panel" className="panel overflow-hidden">
        <HybridRouteStrip latest={latest} />

        <div className="flex flex-col gap-3 border-t border-line bg-surface px-3.5 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-meta text-ink-2">
              <span className="font-mono font-semibold text-ink">LanguageModel.availability()</span>
              <code
                data-testid="nano-text-availability"
                className={`chip font-mono ${nanoAvailability === 'available' ? 'tone-device' : 'tone-neutral'}`}
              >
                <span className="dot" />
                text: {nanoChecking ? 'checking' : nanoAvailability}
              </code>
              <code
                data-testid="nano-image-availability"
                className={`chip font-mono ${nanoImageAvailability === 'available' ? 'tone-device' : 'tone-neutral'}`}
              >
                <span className="dot" />
                image: {nanoChecking ? 'checking' : nanoImageAvailability}
              </code>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="refresh-nano-btn"
                onClick={onRefreshNano}
                className="btn btn-outline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
              {nanoAvailability !== 'available' && (
                <button
                  type="button"
                  data-testid="studio-init-nano-btn"
                  disabled={!canPrepareDevice || downloading}
                  onClick={onInitializeNano}
                  className="btn btn-outline-device"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading
                    ? `Downloading ${downloadPercent}%`
                    : 'Enable On-Device AI'}
                </button>
              )}
              <button
                type="button"
                data-testid="verify-on-device-btn"
                disabled={isRunning || !canRunDeviceText}
                aria-describedby="device-readiness-guidance"
                onClick={onVerifyOnDevice}
                className="btn btn-device"
              >
                <Cpu className="h-3.5 w-3.5" />
                Verify On-Device (ONLY_ON_DEVICE)
              </button>
            </div>
          </div>

          <p id="device-readiness-guidance" className="text-meta text-ink-2">
            {nanoChecking ? 'Checking device support; no model has been run by this check.'
              : !canRunDeviceText && canPrepareDevice ? 'Gemini Nano is downloadable on this browser. Click "Enable On-Device AI" to download the on-device model (no flags needed), or switch Mode to cloud if configured.'
                : !canRunDeviceText ? 'On-device text is not available. Refresh after changing browser support. The itinerary remains editable.'
                  : !canRunDeviceImage ? 'On-device text is ready. Sign images need separate on-device support.'
                    : 'On-device text and image are ready. Verification requires a completed response.'}
          </p>

          {!nanoChecking && nanoAvailability === 'unavailable' && (
            <p className="text-meta text-ink-3 [overflow-wrap:anywhere]">
              Desktop Chrome 139+ required · Enable{' '}
              <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> &amp; check{' '}
              <code>chrome://on-device-internals</code>.
            </p>
          )}
          {nanoInitMessage && (
            <p data-testid="nano-init-message" className="text-meta font-medium text-ink-2">
              {nanoInitMessage}
            </p>
          )}
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
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
              className={`flex flex-col items-start gap-1.5 rounded-[var(--radius-panel)] border px-3.5 py-3 text-left transition ${
                active
                  ? 'border-ink bg-ink text-white shadow-[var(--shadow-raised)]'
                  : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-1.5 text-body font-bold">
                {tab.icon}
                <span>{tab.label}</span>
              </div>
              <span className={`chip min-h-5 py-0 text-[0.6875rem] ${active ? 'border-white/20 bg-white/10 text-white' : `tone-${tabTone[tab.id]}`}`}>
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Controls */}
      {activeTab === 'concierge' && (
        <div className="panel space-y-3 p-3.5 sm:p-4">
          <div className="flex flex-wrap gap-1.5">
            {CONCIERGE_PROMPTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setConciergeInput(preset)}
                className={`chip min-h-8 px-3 text-left whitespace-normal transition hover:border-device-line hover:text-device-strong ${
                  conciergeInput === preset ? 'tone-device' : 'tone-neutral bg-surface'}`}
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
            className="field resize-y"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id="selected-route-guidance" className="text-meta text-ink-3">
              {canRunSelectedText
                ? 'Uses the selected mode.'
                : 'No available route for the selected mode. Edit and check the itinerary without a model.'}
            </span>
            <button
              type="button"
              disabled={isRunning || !canRunSelectedText || !conciergeInput.trim()}
              aria-describedby="selected-route-guidance"
              data-testid="run-concierge-btn"
              onClick={() =>
                onRunTask({ taskKind: 'concierge', userPrompt: conciergeInput.trim() })
              }
              className="btn btn-primary min-h-10 px-4"
            >
              <Send className="h-4 w-4" />
              {isRunning ? 'Running...' : 'Run Hybrid Concierge'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'privacy_vault' && (
        <div className="space-y-3 rounded-[var(--radius-panel)] border border-device-line bg-device-soft/60 p-3.5 sm:p-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-device-line bg-surface px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-device text-white">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-body font-bold text-device-strong">Strict On-Device Privacy Shield (ONLY_ON_DEVICE)</p>
              <p className="mt-0.5 text-meta text-ink-3">
                Forces <code>InferenceMode.ONLY_ON_DEVICE</code>. If Gemini Nano is unavailable,
                execution aborts locally with <strong className="text-ink">0 bytes</strong> sent to cloud servers.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-meta font-semibold text-ink-2">
              Private Medical / Mobility / Room PIN Notes (never uploaded)
            </label>
            <textarea
              rows={2}
              value={trip.privateNotes}
              onChange={(e) => onUpdatePrivateNotes(e.target.value)}
              className="field resize-y"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={privacyInput}
              onChange={(e) => setPrivacyInput(e.target.value)}
              className="field min-w-[200px] flex-1"
            />
            <button
              type="button"
              disabled={isRunning || !canRunDeviceText || !privacyInput.trim()}
              aria-describedby="device-readiness-guidance"
              data-testid="run-privacy-btn"
              onClick={() =>
                onRunTask({ taskKind: 'privacy_vault', userPrompt: privacyInput.trim() })
              }
              className="btn btn-device min-h-10 px-4"
            >
              <Lock className="h-4 w-4" />
              {isRunning ? 'Running...' : 'Run Locally Only'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'sign_vision' && (
        <div className="panel space-y-3 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_SIGNS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                data-testid={`sample-${sample.id}`}
                onClick={() => handlePickSampleSign(sample)}
                className={`btn ${selectedImage?.label === sample.label ? 'btn-outline-device' : 'btn-outline'}`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Use {sample.label}
              </button>
            ))}
            <label className="btn btn-outline cursor-pointer border-dashed">
              <Upload className="h-3.5 w-3.5" />
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
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface p-2.5">
              <img
                src={selectedImage.previewUrl}
                alt={selectedImage.label}
                className="h-16 w-24 rounded-lg border border-line object-cover"
              />
              <div className="text-meta">
                <p className="text-body font-semibold text-ink">{selectedImage.label}</p>
                <p className="text-ink-3">
                  Attached as multimodal <code>inlineData</code> ({selectedImage.mimeType})
                </p>
              </div>
            </div>
          )}

          <p id="sign-route-guidance" className="text-meta text-ink-2">
            {!allowDeviceImageInSelectedMode
              ? 'Images stay on device. Select a mode that allows on-device inference.'
              : canRunDeviceImage ? 'Images run on this device only.' : 'On-device image inference is not available in this browser.'}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={visionInput}
              onChange={(e) => setVisionInput(e.target.value)}
              className="field min-w-[200px] flex-1"
            />
            <button
              type="button"
              disabled={isRunning || !canRunDeviceImage || !allowDeviceImageInSelectedMode || !selectedImage}
              aria-describedby="sign-route-guidance"
              data-testid="run-vision-btn"
              onClick={async () => {
                if (!selectedImage) return;
                await onRunTask({
                  taskKind: 'sign_vision',
                  userPrompt: visionInput.trim(),
                  imageAttachment: selectedImage,
                });
              }}
              className="btn btn-primary min-h-10 px-4"
            >
              <Camera className="h-4 w-4" />
              {isRunning ? 'Analyzing...' : 'Analyze Sign Image'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'schedule_optimize' && (
        <div className="panel space-y-3 p-3.5 sm:p-4">
          <p className="text-body text-ink-2">
            AI proposes structured <code>patchOps</code>; the deterministic schedule engine previews
            exact arrival times &amp; conflict resolution before you click <strong>Keep</strong> or{' '}
            <strong>Discard</strong>.
          </p>
          <p id="optimizer-route-guidance" className="text-meta text-ink-2">
            {canRunSelectedText ? 'Uses the selected mode.' : 'No available route for the selected mode. You can edit and check the schedule without a model.'}
          </p>
          <textarea
            rows={2}
            value={optimizerInput}
            onChange={(e) => setOptimizerInput(e.target.value)}
            className="field resize-y"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isRunning || !canRunSelectedText || !optimizerInput.trim()}
              aria-describedby="optimizer-route-guidance"
              data-testid="run-optimizer-btn"
              onClick={() =>
                onRunTask({ taskKind: 'schedule_optimize', userPrompt: optimizerInput.trim() })
              }
              className="btn btn-primary min-h-10 px-4"
            >
              <Wrench className="h-4 w-4" />
              {isRunning ? 'Optimizing...' : 'Fix Conflicts & Catch Return Train'}
            </button>
          </div>
        </div>
      )}

      {/* Proposal Cards Feed */}
      <div className="space-y-3" data-testid="proposal-feed">
        {proposals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-6 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="max-w-sm text-body text-ink-3">
              Run a task to see where the model actually ran. The timeline remains editable
              on this device without AI or cloud access.
            </p>
          </div>
        ) : (
          proposals.map((p) => {
            const view = describeProposalSource(p);
            const isBlocked = view.route === 'blocked';
            const isError = p.status === 'error';
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
              REQ211_NANO_DOWNLOAD_REQUIRED: 'Chrome Gemini Nano is downloadable on this browser. Click "Enable On-Device AI" above to download the local model, or explicitly select a cloud mode if available.',
              REQ211_CLOUD_INTERRUPTED: 'Connection dropped while the cloud request was pending. The interrupted request was canceled and will not auto-resume on reconnect.',
            }));
            const recoveryText = recoveryByCode.get(p.errorMessage ?? '') ||
              (isBlocked ? 'Gemini Nano is unavailable. The request stopped before any model call.' :
                'The AI request stopped without a completed result.');

            const cleanBody = stripJsonBlocksForDisplay(p.responseText);
            const mayApply = view.confirmed && Boolean(p.responseText.trim());
            const finished = !isError && p.status !== 'streaming';
            const sourceClaim = finished && view.route === 'device' ? 'Local inference' :
              finished && view.route === 'cloud' ? 'Cloud inference' :
              finished && view.route === 'emulator' ? 'Emulated response' : 'No source claim';
            const accent = view.tone === 'device' ? 'border-l-device' : view.tone === 'cloud' ? 'border-l-cloud' :
              view.tone === 'guard' ? 'border-l-guard' : view.tone === 'danger' ? 'border-l-danger' : 'border-l-line-strong';

            return (
              <article
                key={p.id}
                data-testid={`proposal-card-${p.kind}`}
                className={`rounded-[var(--radius-panel)] border border-line border-l-4 ${accent} bg-surface p-3.5 shadow-[var(--shadow-raised)] sm:p-4`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span data-testid="proposal-source-badge" className={`chip tone-${view.tone} whitespace-normal`}>
                    {view.icon}
                    {view.label}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5 text-meta tabular-nums">
                    <span className="chip tone-neutral min-h-6 py-0">
                      {p.telemetry.onlineAtStart ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      {p.telemetry.onlineAtStart ? 'Online' : 'Offline'}
                    </span>
                    <span className="chip tone-neutral min-h-6 py-0">
                      <span className="text-ink-3">TTFT</span>
                      {p.telemetry.ttftMs !== null ? `${p.telemetry.ttftMs}ms` : '—'}
                    </span>
                    <span className="chip tone-neutral min-h-6 py-0">
                      <span className="text-ink-3">Total</span>
                      {p.telemetry.totalMs}ms
                    </span>
                    <span className="pl-1 font-semibold text-ink-2">{sourceClaim}</span>
                  </div>
                </div>

                {p.status === 'error' ? (
                  <div className="mt-3 space-y-1 text-body text-ink-2" role="status">
                    <p className={`font-semibold ${isBlocked ? 'text-guard-strong' : 'text-danger-strong'}`}>{recoveryText}</p>
                    <p className="text-ink-3">No changes from this request were applied.</p>
                    <a href="#local-itinerary" className="inline-flex min-h-11 items-center gap-1 font-semibold text-device-strong underline decoration-device-line underline-offset-4 hover:decoration-device">
                      Continue in the local timeline
                    </a>
                  </div>
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-body leading-relaxed text-ink">
                    {cleanBody || (p.status === 'streaming' ? 'Streaming response...' : '')}
                  </div>
                )}

                {mayApply && p.patchOps.length > 0 && p.diffSummary && (
                  <div
                    data-testid="deterministic-diff-card"
                    className="mt-3.5 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-body font-bold text-ink">
                        Deterministic Verification Preview ({p.patchOps.length} patch ops)
                      </span>
                      {p.previewEvaluation && (
                        <span className={`chip ${p.previewEvaluation.isValid ? 'tone-ok' : 'tone-danger'}`}>
                          Projected finish: {formatMinutes(p.previewEvaluation.totalEndMin)} (
                          {p.previewEvaluation.isValid
                            ? 'All hard conflicts resolved'
                            : `${p.previewEvaluation.errorCount} hard conflicts remain`}
                          )
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 tabular-nums">
                      <DiffStat
                        label="Conflicts"
                        before={String(p.diffSummary.beforeErrors)}
                        after={String(p.diffSummary.afterErrors)}
                        improved={p.diffSummary.afterErrors < p.diffSummary.beforeErrors}
                      />
                      <DiffStat
                        label="Buffer"
                        before={p.diffSummary.beforeMarginMin >= 0 ? `+${p.diffSummary.beforeMarginMin}m` : `${p.diffSummary.beforeMarginMin}m`}
                        after={p.diffSummary.afterMarginMin >= 0 ? `+${p.diffSummary.afterMarginMin}m` : `${p.diffSummary.afterMarginMin}m`}
                        improved={p.diffSummary.afterMarginMin > p.diffSummary.beforeMarginMin}
                      />
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {p.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            data-testid="keep-proposal-btn"
                            onClick={() => onKeepProposal(p.id)}
                            className="btn btn-primary min-h-10 px-4"
                          >
                            <Check className="h-4 w-4" />
                            Keep Changes
                          </button>
                          <button
                            type="button"
                            data-testid="discard-proposal-btn"
                            onClick={() => onDiscardProposal(p.id)}
                            className="btn btn-outline min-h-10 px-4"
                          >
                            <X className="h-4 w-4" />
                            Discard
                          </button>
                        </>
                      ) : (
                        <span className={`chip ${p.status === 'kept' ? 'tone-ok' : 'tone-neutral'}`}>
                          {p.status === 'kept' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
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

function DiffStat({ label, before, after, improved }: { label: string; before: string; after: string; improved: boolean }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5">
      <p className="kicker">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 font-display text-title font-bold">
        <span className="text-ink-3 line-through decoration-line-strong">{before}</span>
        <ArrowRight className="h-4 w-4 self-center text-ink-3" />
        <span className={improved ? 'text-ok' : 'text-ink'}>{after}</span>
      </p>
    </div>
  );
}

/**
 * Device <- Firebase AI Logic -> Cloud. Lights the path the latest run actually took,
 * read from the same SDK-confirmed source as the proposal badge.
 */
function HybridRouteStrip({ latest }: { latest?: TripProposal }) {
  const route: RouteState = latest ? describeProposalSource(latest).route : 'idle';
  const deviceLit = route === 'device' || route === 'blocked';
  const cloudLit = route === 'cloud';
  const deviceTone: Tone = route === 'blocked' ? 'guard' : 'device';
  const caption = (() => {
    switch (route) {
      case 'device': return { text: 'Last run executed on this device', tone: 'device' as Tone };
      case 'cloud': return { text: 'Last run executed in the cloud', tone: 'cloud' as Tone };
      case 'blocked': return { text: 'Last run stopped on this device · 0 bytes sent', tone: 'guard' as Tone };
      case 'running': return { text: 'Running · source not yet confirmed', tone: 'neutral' as Tone };
      case 'emulator': return { text: 'Last run used the local emulator', tone: 'neutral' as Tone };
      case 'failed': return { text: 'Last run did not complete', tone: 'danger' as Tone };
      case 'unverified': return { text: 'Last run source not confirmed · result not used', tone: 'guard' as Tone };
      default: return { text: 'Run a task to light up the route it takes', tone: 'neutral' as Tone };
    }
  })();

  const node = (lit: boolean, tone: Tone, icon: React.ReactNode, title: string, sub: string) => (
    <div className={`flex min-w-0 flex-1 flex-row items-center gap-2.5 rounded-[var(--radius-control)] border px-3 py-2 text-left transition ${
      lit ? `tone-${tone} shadow-[var(--shadow-raised)]` : 'border-line bg-surface text-ink-3'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        lit ? (tone === 'cloud' ? 'bg-cloud text-white' : tone === 'guard' ? 'bg-guard text-white' : tone === 'neutral' ? 'bg-ink text-white' : 'bg-device text-white') : 'bg-surface-2 text-ink-3'}`}>
        {icon}
      </span>
      <span className="w-full min-w-0">
        <span className={`block text-meta leading-tight font-bold sm:truncate ${lit ? '' : 'text-ink-2'}`}>{title}</span>
        <span className="block text-[0.6875rem] leading-tight opacity-80">{sub}</span>
      </span>
    </div>
  );
  const link = (lit: boolean, tone: Tone, blocked = false) => (
    <div className="relative flex h-4 items-center justify-center sm:h-auto sm:w-8 sm:shrink-0" aria-hidden="true">
      <span className={`h-full w-0.5 rounded sm:h-0.5 sm:w-full ${lit ? (tone === 'cloud' ? 'bg-cloud' : tone === 'guard' ? 'bg-guard' : 'bg-device') : 'bg-line-strong'} ${blocked ? 'opacity-40' : ''}`} />
      {blocked && <Ban className="absolute left-1/2 h-4 w-4 -translate-x-1/2 bg-surface-2 text-guard" />}
    </div>
  );

  return (
    <div className="px-3.5 py-3 sm:px-4" data-testid="hybrid-route-strip" data-route={route}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <span className="kicker">Inference route</span>
        <span className={`chip min-h-6 whitespace-normal py-0.5 tone-${caption.tone}`}>
          <span className="dot" />
          {caption.text}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        {node(deviceLit, deviceTone, <Cpu className="h-4 w-4" />, 'This device', 'Gemini Nano')}
        {link(deviceLit, deviceTone)}
        {node(route !== 'idle', route === 'cloud' ? 'cloud' : deviceLit ? deviceTone : 'neutral', <Layers className="h-4 w-4" />, 'Firebase AI Logic', 'firebase/ai')}
        {link(cloudLit, 'cloud', route === 'blocked')}
        {node(cloudLit, 'cloud', <Cloud className="h-4 w-4" />, 'Cloud', 'gemini-3.5-flash-lite')}
      </div>
    </div>
  );
}
