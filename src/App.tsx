import { useCallback, useEffect, useMemo, useState } from 'react';
import { InferenceMode } from 'firebase/ai';
import {
  checkOnDeviceAvailability,
  initializeOnDeviceModel,
  runCompetitionPrompt,
  type LocalModelAvailability,
} from './ai/hybridInferenceService';
import {
  buildConciergePrompt,
  buildPrivacyVaultPrompt,
  buildScheduleOptimizerPrompt,
  buildSignVisionPrompt,
} from './ai/prompts';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { HeaderBar } from './components/HeaderBar';
import { HybridStudioPane } from './components/HybridStudioPane';
import { ItineraryPane } from './components/ItineraryPane';
import { TelemetryInspector } from './components/TelemetryInspector';
import { cloneTrip, PRESET_TRIPS } from './domain/presets';
import {
  extractProposalOps,
  type InferenceTelemetry,
  type TaskKind,
  type TripProposal,
} from './domain/proposal';
import {
  applyProposalOps,
  diffSchedule,
  evaluateTripSchedule,
} from './domain/scheduleEngine';
import type { DayOfWeek, Trip, TripStop } from './domain/trip';
import { initializeFirebaseServices, type FirebaseRuntimeHandle } from './firebase/init';
import {
  loadLocalTrips,
  saveLocalTrips,
  syncTripToFirestoreIfEnabled,
} from './firebase/tripRepository';

export function App() {
  const [trips, setTrips] = useState<Trip[]>(() => loadLocalTrips());
  const [activeTripId, setActiveTripId] = useState<string>(() => loadLocalTrips()[0]?.id || 'kyoto-family-tue');
  const [activeTab, setActiveTab] = useState<TaskKind>('concierge');

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [firebaseHandle, setFirebaseHandle] = useState<FirebaseRuntimeHandle | null>(null);
  const [nanoAvailability, setNanoAvailability] =
    useState<LocalModelAvailability>('unavailable');
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>(
    InferenceMode.PREFER_ON_DEVICE
  );
  const [syncStatus, setSyncStatus] = useState<
    'local_only' | 'firestore_synced' | 'firestore_offline_queued'
  >('local_only');

  const [proposals, setProposals] = useState<TripProposal[]>([]);
  const [telemetryEntries, setTelemetryEntries] = useState<InferenceTelemetry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? trips[0],
    [trips, activeTripId]
  );

  const evaluation = useMemo(() => evaluateTripSchedule(activeTrip), [activeTrip]);

  const bootstrapSdk = useCallback(async () => {
    const handle = await initializeFirebaseServices();
    setFirebaseHandle(handle);
    setInferenceMode(handle.remotePolicy.defaultInferenceMode);
    const avail = await checkOnDeviceAvailability(false);
    setNanoAvailability(avail);
  }, []);

  useEffect(() => {
    void bootstrapSdk();
  }, [bootstrapSdk]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const persistTripUpdate = useCallback(
    (updater: (prev: Trip) => Trip) => {
      setTrips((prevList) => {
        const nextList = prevList.map((t) =>
          t.id === activeTrip.id ? updater(t) : t
        );
        saveLocalTrips(nextList);
        const updated = nextList.find((t) => t.id === activeTrip.id);
        if (updated) {
          void syncTripToFirestoreIfEnabled(firebaseHandle, updated).then(
            setSyncStatus
          );
        }
        return nextList;
      });
    },
    [activeTrip.id, firebaseHandle]
  );

  const handleInitializeNano = async () => {
    if (!firebaseHandle) return;
    setDownloadPercent(0);
    try {
      await initializeOnDeviceModel(
        firebaseHandle.ai,
        firebaseHandle.remotePolicy.cloudFallbackModel,
        (pct) => setDownloadPercent(pct)
      );
      setDownloadPercent(100);
      setNanoAvailability(await checkOnDeviceAvailability(false));
    } catch {
      setDownloadPercent(null);
      setNanoAvailability(await checkOnDeviceAvailability(false));
    }
  };

  const handleRunTask = async ({
    taskKind,
    userPrompt,
    imageAttachment,
  }: {
    taskKind: TaskKind;
    userPrompt: string;
    imageAttachment?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      previewUrl: string;
      label: string;
    };
  }) => {
    if (!firebaseHandle) return;
    setIsRunning(true);

    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullPrompt = (() => {
      switch (taskKind) {
        case 'privacy_vault':
          return buildPrivacyVaultPrompt(activeTrip, userPrompt);
        case 'sign_vision':
          return buildSignVisionPrompt(activeTrip, userPrompt);
        case 'schedule_optimize':
          return buildScheduleOptimizerPrompt(activeTrip, evaluation, userPrompt);
        default:
          return buildConciergePrompt(activeTrip, evaluation, userPrompt);
      }
    })();

    const requestedMode =
      taskKind === 'privacy_vault' ? InferenceMode.ONLY_ON_DEVICE : inferenceMode;

    const initialTelemetry: InferenceTelemetry = {
      id: `tel-pending-${proposalId}`,
      taskKind,
      requestedMode,
      actualSource: InferenceMode.ONLY_IN_CLOUD === requestedMode ? 'in_cloud' : 'on_device',
      modelLabel: 'Running...',
      onlineAtStart: isOnline,
      appCheckMode: firebaseHandle.appCheckMode,
      ttftMs: null,
      totalMs: 0,
      estimatedCloudCostUsd: 0,
      inputModalities: imageAttachment ? ['text', 'image'] : ['text'],
      timestamp: Date.now(),
    };

    const placeholder: TripProposal = {
      id: proposalId,
      kind: taskKind,
      prompt: userPrompt,
      responseText: '',
      patchOps: [],
      status: 'streaming',
      telemetry: initialTelemetry,
      createdAt: Date.now(),
    };

    setProposals((prev) => [placeholder, ...prev]);

    try {
      const result = await runCompetitionPrompt(
        firebaseHandle,
        {
          taskKind,
          requestedMode,
          prompt: fullPrompt,
          imageAttachment: imageAttachment
            ? {
                base64Data: imageAttachment.base64Data,
                mimeType: imageAttachment.mimeType,
              }
            : undefined,
        },
        (accumulatedText) => {
          setProposals((prev) =>
            prev.map((item) =>
              item.id === proposalId ? { ...item, responseText: accumulatedText } : item
            )
          );
        }
      );

      const patchOps =
        taskKind === 'schedule_optimize'
          ? extractProposalOps(result.text, activeTrip)
          : [];
      const previewTrip =
        patchOps.length > 0 ? applyProposalOps(activeTrip, patchOps) : null;
      const previewEvaluation = previewTrip
        ? evaluateTripSchedule(previewTrip)
        : undefined;
      const diffSummary = previewEvaluation
        ? diffSchedule(evaluation, previewEvaluation)
        : undefined;

      setProposals((prev) =>
        prev.map((item) =>
          item.id === proposalId
            ? {
                ...item,
                responseText: result.text,
                patchOps,
                previewEvaluation,
                diffSummary,
                status: 'pending',
                telemetry: result.telemetry,
              }
            : item
        )
      );
      setTelemetryEntries((prev) => [result.telemetry, ...prev]);
      setNanoAvailability(await checkOnDeviceAvailability(false));
    } catch (err) {
      const enriched = err as Error & { telemetry?: InferenceTelemetry };
      const failedTelemetry: InferenceTelemetry = enriched.telemetry ?? {
        ...initialTelemetry,
        actualSource: 'error',
        modelLabel: firebaseHandle.remotePolicy.cloudFallbackModel,
      };
      setProposals((prev) =>
        prev.map((item) =>
          item.id === proposalId
            ? {
                ...item,
                status: 'error',
                errorMessage:
                  taskKind === 'privacy_vault'
                    ? `Blocked locally by Privacy Shield (${failedTelemetry.requestedMode}): Chrome Gemini Nano is unavailable on this browser, so 0 bytes were sent to any cloud server.`
                    : enriched.message || 'Inference failed.',
                telemetry: failedTelemetry,
              }
            : item
        )
      );
      setTelemetryEntries((prev) => [failedTelemetry, ...prev]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeepProposal = (proposalId: string) => {
    const target = proposals.find((p) => p.id === proposalId);
    if (!target || target.patchOps.length === 0) return;

    persistTripUpdate((prev) => applyProposalOps(prev, target.patchOps));
    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status: 'kept' } : p))
    );
  };

  const handleDiscardProposal = (proposalId: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status: 'discarded' } : p))
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-stone-900">
      <HeaderBar
        trips={trips}
        activeTripId={activeTrip.id}
        onSelectTrip={setActiveTripId}
        onResetTrips={() => {
          const fresh = PRESET_TRIPS.map(cloneTrip);
          setTrips(fresh);
          saveLocalTrips(fresh);
          setActiveTripId(fresh[0].id);
        }}
        isOnline={isOnline}
        nanoAvailability={nanoAvailability}
        downloadPercent={downloadPercent}
        onInitializeNano={handleInitializeNano}
        inferenceMode={inferenceMode}
        onChangeInferenceMode={setInferenceMode}
        appCheckMode={firebaseHandle?.appCheckMode ?? 'unconfigured'}
        isLiveProject={firebaseHandle?.setup.isLiveProject ?? false}
        usingEmulator={Boolean(firebaseHandle?.setup.emulatorBaseUrl)}
        onOpenSetup={() => setSetupOpen(true)}
      />

      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ItineraryPane
            trip={activeTrip}
            evaluation={evaluation}
            syncStatus={syncStatus}
            onChangeStartTime={(startTimeMin) =>
              persistTripUpdate((prev) => ({
                ...prev,
                startTimeMin,
                updatedAt: Date.now(),
              }))
            }
            onChangeDayOfWeek={(dayOfWeek: DayOfWeek) =>
              persistTripUpdate((prev) => ({
                ...prev,
                dayOfWeek,
                updatedAt: Date.now(),
              }))
            }
            onMoveStop={(stopId, dir) =>
              persistTripUpdate((prev) => {
                const idx = prev.stops.findIndex((s) => s.id === stopId);
                const nextIdx = idx + dir;
                if (idx === -1 || nextIdx < 0 || nextIdx >= prev.stops.length) return prev;
                const copy = [...prev.stops];
                const [item] = copy.splice(idx, 1);
                copy.splice(nextIdx, 0, item);
                return { ...prev, stops: copy, updatedAt: Date.now() };
              })
            }
            onAdjustDuration={(stopId, delta) =>
              persistTripUpdate((prev) => ({
                ...prev,
                stops: prev.stops.map((s) =>
                  s.id === stopId
                    ? { ...s, durationMin: Math.max(15, Math.min(360, s.durationMin + delta)) }
                    : s
                ),
                updatedAt: Date.now(),
              }))
            }
            onDeleteStop={(stopId) =>
              persistTripUpdate((prev) => ({
                ...prev,
                stops: prev.stops.filter((s) => s.id !== stopId),
                updatedAt: Date.now(),
              }))
            }
            onAddStop={(stop: TripStop) =>
              persistTripUpdate((prev) => ({
                ...prev,
                stops: [...prev.stops, stop],
                updatedAt: Date.now(),
              }))
            }
          />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-6">
          <HybridStudioPane
            trip={activeTrip}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onUpdatePrivateNotes={(notes) =>
              persistTripUpdate((prev) => ({
                ...prev,
                privateNotes: notes,
                updatedAt: Date.now(),
              }))
            }
            onRunTask={handleRunTask}
            isRunning={isRunning}
            proposals={proposals}
            onKeepProposal={handleKeepProposal}
            onDiscardProposal={handleDiscardProposal}
          />

          <TelemetryInspector entries={telemetryEntries} />
        </div>
      </main>

      <FirebaseConfigModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        cloudConfigured={firebaseHandle?.setup.isLiveProject ?? false}
      />
    </div>
  );
}

export default App;
