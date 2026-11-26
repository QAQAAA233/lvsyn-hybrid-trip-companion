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

interface HeaderBarProps {
  trips: Trip[];
  activeTripId: string;
  onSelectTrip: (tripId: string) => void;
  onResetTrips: () => void;
  isOnline: boolean;
  nanoAvailability: LocalModelAvailability;
  downloadPercent: number | null;
  onInitializeNano: () => void;
  inferenceMode: InferenceMode;
  onChangeInferenceMode: (mode: InferenceMode) => void;
  appCheckMode: AppCheckMode;
  isLiveProject: boolean;
  usingEmulator: boolean;
  onOpenSetup: () => void;
}

export function HeaderBar({
  trips,
  activeTripId,
  onSelectTrip,
  onResetTrips,
  isOnline,
  nanoAvailability,
  downloadPercent,
  onInitializeNano,
  inferenceMode,
  onChangeInferenceMode,
  appCheckMode,
  isLiveProject,
  usingEmulator,
  onOpenSetup,
}: HeaderBarProps) {
  const nanoBadge = (() => {
    if (downloadPercent !== null && downloadPercent < 100) {
      return {
        label: `Downloading Nano ${downloadPercent}%`,
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    if (nanoAvailability === 'available') {
      return {
        label: 'Gemini Nano Ready',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    }
    if (nanoAvailability === 'downloadable' || nanoAvailability === 'downloading') {
      return {
        label: 'Nano Downloadable',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    return {
      label: isLiveProject ? 'Nano Unavailable · gated cloud fallback' : 'Nano Unavailable · cloud locked',
      className: 'bg-blue-50 text-blue-800 border-blue-200',
    };
  })();

  const appCheckLabel = (() => {
    if (appCheckMode === 'recaptcha_enterprise') return 'App Check: Enterprise configured (per-request check)';
    if (appCheckMode === 'recaptcha_v3') return 'App Check: reCAPTCHA v3';
    if (appCheckMode === 'debug_token') return 'App Check: Debug Token';
    if (appCheckMode === 'local_emulator_provider') return 'App Check: Emulator Token';
    return isLiveProject ? 'App Check: Pending' : 'App Check: Local Demo';
  })();

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-stone-900 sm:text-lg">
                LvSyn Hybrid Trip Companion
              </h1>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                Firebase AI Logic
              </span>
            </div>
            <p className="text-xs text-stone-500">
              On-device Chrome Gemini Nano + gated cloud text fallback + deterministic schedule verification
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            <select
              aria-label="Select preset trip"
              data-testid="trip-selector"
              value={activeTripId}
              onChange={(e) => onSelectTrip(e.target.value)}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-stone-800 outline-none"
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
              className="rounded-md p-1.5 text-stone-500 transition hover:bg-white hover:text-stone-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <span
            data-testid="network-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isOnline
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>

          <span
            data-testid="nano-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${nanoBadge.className}`}
          >
            <Cpu className="h-3.5 w-3.5" />
            {nanoBadge.label}
          </span>

          {(nanoAvailability === 'downloadable' || nanoAvailability === 'downloading') && (
            <button
              type="button"
              data-testid="init-nano-btn"
              onClick={onInitializeNano}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Prepare Nano
            </button>
          )}

          <span
            data-testid="appcheck-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            {appCheckLabel}
          </span>

          {usingEmulator && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
              <Cloud className="h-3.5 w-3.5" />
              Local Cloud Emulator
            </span>
          )}

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">
            <span className="text-stone-400">Mode:</span>
            <select
              aria-label="Inference mode"
              data-testid="inference-mode-select"
              value={inferenceMode}
              onChange={(e) => onChangeInferenceMode(e.target.value as InferenceMode)}
              className="bg-transparent font-semibold text-stone-900 outline-none"
            >
              <option value={InferenceMode.PREFER_ON_DEVICE}>PREFER_ON_DEVICE</option>
              <option value={InferenceMode.ONLY_ON_DEVICE}>ONLY_ON_DEVICE</option>
              <option value={InferenceMode.PREFER_IN_CLOUD}>PREFER_IN_CLOUD</option>
              <option value={InferenceMode.ONLY_IN_CLOUD}>ONLY_IN_CLOUD</option>
            </select>
          </label>

          <button
            type="button"
            data-testid="firebase-setup-btn"
            onClick={onOpenSetup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            <Settings className="h-3.5 w-3.5" />
            Firebase Setup
          </button>
        </div>
      </div>
    </header>
  );
}
