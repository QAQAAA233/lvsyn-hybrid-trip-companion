import { InferenceMode } from 'firebase/ai';
import {
  Cloud,
  Cpu,
  Download,
  RefreshCw,
  Settings,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { LocalModelAvailability } from '../ai/hybridInferenceService';
import type { AppCheckMode } from '../domain/proposal';
import type { Trip } from '../domain/trip';
import type { Tone } from './sourcePresentation';

interface HeaderBarProps {
  trips: Trip[];
  activeTripId: string;
  onSelectTrip: (tripId: string) => void;
  onResetTrips: () => void;
  isOnline: boolean;
  nanoAvailability: LocalModelAvailability;
  nanoChecking: boolean;
  canPrepareDevice: boolean;
  cloudSelectable: boolean;
  downloadPercent: number | null;
  onInitializeNano: () => void;
  inferenceMode: InferenceMode;
  onChangeInferenceMode: (mode: InferenceMode) => void;
  appCheckMode: AppCheckMode;
  isLiveProject: boolean;
  usingEmulator: boolean;
  onOpenSetup: () => void;
}

export function BrandMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--color-device)" />
      <path d="M18 44V20l14 14 14-14v24" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="32" cy="17" r="4" fill="#F7D488" />
      <circle cx="48" cy="46" r="6" fill="var(--color-cloud)" stroke="#FFFFFF" strokeWidth="2.5" />
    </svg>
  );
}

/** One labelled readout in the hybrid status rail. */
function StatusCell({ label, tone, testId, icon, children }: {
  label: string; tone: Tone; testId?: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 px-2 py-1.5 sm:px-4 lg:shrink-0 sm:first:pl-0">
      <span className="kicker">{label}</span>
      <span data-testid={testId} className={`chip tone-${tone}`}>
        {icon}
        {children}
      </span>
    </div>
  );
}

export function HeaderBar({
  trips,
  activeTripId,
  onSelectTrip,
  onResetTrips,
  isOnline,
  nanoAvailability,
  nanoChecking,
  canPrepareDevice,
  cloudSelectable,
  downloadPercent,
  onInitializeNano,
  inferenceMode,
  onChangeInferenceMode,
  appCheckMode,
  isLiveProject,
  usingEmulator,
  onOpenSetup,
}: HeaderBarProps) {
  const cloudStatus = !isLiveProject
    ? 'Cloud is locked in this demo.'
    : cloudSelectable ? 'Cloud text requires an explicit cloud mode.'
      : 'Cloud text is not available right now.';
  const deviceStatus = nanoChecking ? 'Checking device support…' :
    nanoAvailability === 'available' ? 'On-device inference is available.' :
    nanoAvailability === 'downloadable' || nanoAvailability === 'downloading'
      ? 'On-device inference needs setup.' : 'On-device inference is unavailable in this browser.';
  const downloading = downloadPercent !== null && downloadPercent < 100;

  const nanoBadge: { label: string; tone: Tone } = (() => {
    if (downloading) return { label: `Downloading Nano ${downloadPercent}%`, tone: 'guard' };
    if (nanoChecking) return { label: 'Checking device support…', tone: 'neutral' };
    if (nanoAvailability === 'available') return { label: 'On-Device AI: available', tone: 'device' };
    if (nanoAvailability === 'downloadable' || nanoAvailability === 'downloading') {
      return { label: `On-Device AI: ${nanoAvailability}`, tone: 'guard' };
    }
    return { label: 'On-Device AI: unavailable', tone: 'neutral' };
  })();

  const appCheckLabel = (() => {
    if (appCheckMode === 'recaptcha_enterprise') return 'App Check: Enterprise';
    if (appCheckMode === 'recaptcha_v3') return 'App Check: reCAPTCHA v3';
    if (appCheckMode === 'debug_token') return 'App Check: Debug Token';
    if (appCheckMode === 'local_emulator_provider') return 'App Check: Emulator';
    return isLiveProject ? 'App Check: Pending' : 'App Check: Local-Only';
  })();
  const appCheckTone: Tone = appCheckMode === 'unconfigured' ? 'neutral' : 'cloud';

  return (
    <header>
      {/* Brand band */}
      <div className="bg-night text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-3 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandMark className="h-11 w-11 shrink-0 drop-shadow" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="font-display text-title font-bold tracking-tight sm:text-display">
                  LvSyn Hybrid Trip Companion
                </h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-meta font-semibold text-white/90">
                  Firebase AI Logic
                </span>
              </div>
              <p className="mt-0.5 text-meta text-white/75 sm:text-body">
                On-device Chrome Gemini Nano + gated cloud text + deterministic schedule verification
              </p>
              <p className="mt-1 text-meta font-medium text-white/90" role="status">
                {deviceStatus} {cloudStatus} Itinerary editing works offline.
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-1 rounded-[var(--radius-control)] border border-white/15 bg-white/10 p-1 sm:w-auto">
            <select
              aria-label="Select preset trip"
              data-testid="trip-selector"
              value={activeTripId}
              onChange={(e) => onSelectTrip(e.target.value)}
              className="trip-native-select min-h-8 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-meta font-semibold text-ink outline-none sm:flex-none"
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onResetTrips}
              title="Reset sample itineraries"
              aria-label="Reset sample itineraries"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Hybrid status rail */}
      <div className="border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-end gap-y-1 px-2 py-2 sm:px-8 sm:py-2.5 lg:flex-nowrap lg:divide-x lg:divide-line">
          <StatusCell
            label="Network"
            tone={isOnline ? 'ok' : 'danger'}
            testId="network-badge"
            icon={isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          >
            {isOnline ? 'Online' : 'Offline'}
          </StatusCell>

          <div className="flex min-w-0 max-w-full flex-col gap-1 px-2 py-1.5 sm:px-4 lg:shrink-0">
            <span className="kicker">This device</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span data-testid="nano-badge" className={`chip tone-${nanoBadge.tone}`}>
                <Cpu className="h-3.5 w-3.5" />
                {nanoBadge.label}
              </span>
              {nanoAvailability !== 'available' && (
                <button
                  type="button"
                  data-testid="init-nano-btn"
                  disabled={!canPrepareDevice || downloading}
                  onClick={onInitializeNano}
                  className="btn btn-device min-h-6 rounded-full px-2.5 py-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading ? `Downloading ${downloadPercent}%` : 'Enable On-Device AI'}
                </button>
              )}
            </div>
          </div>

          <StatusCell
            label="Cloud guard"
            tone={appCheckTone}
            testId="appcheck-badge"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          >
            {appCheckLabel}
          </StatusCell>

          {usingEmulator && (
            <StatusCell label="Cloud" tone="cloud" icon={<Cloud className="h-3.5 w-3.5" />}>
              Local Cloud Emulator
            </StatusCell>
          )}

          <div className="flex min-w-0 max-w-full flex-col gap-1 px-2 py-1.5 sm:px-4 lg:shrink-0">
            <span className="kicker">Routing</span>
            <label className="chip tone-neutral pr-1.5">
              <span className="text-ink-3">Mode:</span>
              <select
                aria-label="Inference mode"
                data-testid="inference-mode-select"
                value={inferenceMode}
                onChange={(e) => onChangeInferenceMode(e.target.value as InferenceMode)}
                className="trip-native-select bg-transparent font-mono font-semibold text-ink outline-none"
              >
                <option value={InferenceMode.PREFER_ON_DEVICE}>PREFER_ON_DEVICE</option>
                <option value={InferenceMode.ONLY_ON_DEVICE}>ONLY_ON_DEVICE</option>
                <option value={InferenceMode.PREFER_IN_CLOUD} disabled={!cloudSelectable}>PREFER_IN_CLOUD</option>
                <option value={InferenceMode.ONLY_IN_CLOUD} disabled={!cloudSelectable}>ONLY_IN_CLOUD</option>
              </select>
            </label>
          </div>

          <div className="flex min-w-0 max-w-full flex-col gap-1 px-2 py-1.5 sm:px-4 lg:shrink-0">
            <span className="kicker">Project</span>
            <button
              type="button"
              data-testid="firebase-setup-btn"
              onClick={onOpenSetup}
              className="btn btn-outline min-h-7 rounded-full px-3 py-0"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Firebase Setup</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
