import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CLOUD_ATTEMPT_KEY, readCloudAttemptStatus, type CloudAttemptStatus } from './firebase/cloudAttemptBudget';
import {
  loadLocalTrips,
  saveLocalTrips,
  type LocalTripSaveResult,
} from './firebase/tripRepository';

export function App() {
  const [trips, setTrips] = useState<Trip[]>(() => loadLocalTrips());
  const tripsRef = useRef(trips);
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalTripSaveResult|'ready'>('ready');
  const [activeTripId, setActiveTripId] = useState<string>(() => trips[0]?.id || 'kyoto-family-tue');
  const [activeTab, setActiveTab] = useState<TaskKind>('concierge');

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [firebaseHandle, setFirebaseHandle] = useState<FirebaseRuntimeHandle | null>(null);
  const [cloudAttemptStatus,setCloudAttemptStatus] = useState<CloudAttemptStatus|null>(null);
  const cloudBound=Boolean(firebaseHandle?.setup.isLiveProject);
  const [nanoAvailability, setNanoAvailability] =
    useState<LocalModelAvailability>('unavailable');
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>(
    InferenceMode.PREFER_ON_DEVICE
  );
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
    try {
      const handle = await initializeFirebaseServices();
      setFirebaseHandle(handle);
      setNanoAvailability(await checkOnDeviceAvailability(false));
    } catch {
      // Keep the timeline available. A later deliberate Run attempts a fresh local session.
      setNanoAvailability('unavailable');
    }
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

  useEffect(()=>{
    if(!cloudBound) {setCloudAttemptStatus(null);return;}
    const update=()=>setCloudAttemptStatus(readCloudAttemptStatus());
    const observe=(event:StorageEvent)=>{if(event.key===CLOUD_ATTEMPT_KEY||event.key===null) update();};
    update();
    window.addEventListener('storage',observe);
    window.addEventListener('focus',update);
    const interval=window.setInterval(update,60_000);
    return ()=>{
      window.removeEventListener('storage',observe);
      window.removeEventListener('focus',update);
      window.clearInterval(interval);
    };
  },[cloudBound]);

  const commitLocalTrips=useCallback((next:Trip[])=>{
    // Apply the edit regardless of disk availability; no write side effect inside a React updater.
    tripsRef.current=next;
    setTrips(next);
    setLocalSaveStatus(saveLocalTrips(next));
  },[]);
  const retryLocalSave=useCallback(()=>{
    // A deliberate retry always writes the latest local edit, not an older captured trip.
    setLocalSaveStatus(saveLocalTrips(tripsRef.current));
  },[]);
  const persistTripUpdate = useCallback(
    (updater: (prev: Trip) => Trip) => {
      commitLocalTrips(tripsRef.current.map(t=>t.id===activeTrip.id ? updater(t) : t));
    },
    [activeTrip.id, commitLocalTrips]
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
      actualSource: 'pending_source',
      modelLabel: 'Running...',
      onlineAtStart: isOnline,
      appCheckMode: firebaseHandle?.appCheckMode ?? 'unconfigured',
      ttftMs: null,
      totalMs: 0,
      estimatedCloudCostUsd: null,
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
      // Recover a failed prep on this user action only; never silently switch providers.
      const runtime = firebaseHandle ?? await initializeFirebaseServices().catch(() => {
        throw new Error('REQ211_RUNTIME_NOT_READY');
      });
      if (!firebaseHandle) setFirebaseHandle(runtime);
      const result = await runCompetitionPrompt(
        runtime,
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
      void checkOnDeviceAvailability(false).then(setNanoAvailability, () => undefined);
    } catch (err) {
      const enriched = err as Error & { telemetry?: InferenceTelemetry };
      const failedTelemetry: InferenceTelemetry = enriched.telemetry ?? {
        ...initialTelemetry,
        actualSource: 'error',
        modelLabel: 'No completed model result',
      };
      setProposals((prev) =>
        prev.map((item) =>
          item.id === proposalId
            ? {
                ...item,
                status: 'error',
                responseText: '',
                patchOps: [],
                errorMessage: enriched.message || 'Inference failed.',
                telemetry: failedTelemetry,
              }
            : item
        )
      );
      setTelemetryEntries((prev) => [failedTelemetry, ...prev]);
    } finally {
      if(cloudBound) setCloudAttemptStatus(readCloudAttemptStatus());
      setIsRunning(false);
    }
  };

  const handleKeepProposal = (proposalId: string) => {
    const target = proposals.find((p) => p.id === proposalId);
    if (!target || target.status !== 'pending' || target.patchOps.length === 0 ||
        target.telemetry.sourceEvidence !== 'sdk_terminal_response' || !target.responseText.trim()) return;

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
          commitLocalTrips(fresh);
          setActiveTripId(fresh[0].id);
        }}
        isOnline={isOnline}
        nanoAvailability={nanoAvailability}
        downloadPercent={downloadPercent}
        onInitializeNano={handleInitializeNano}
        inferenceMode={inferenceMode}
        onChangeInferenceMode={setInferenceMode}
        appCheckMode={firebaseHandle?.appCheckMode ?? 'unconfigured'}
        isLiveProject={cloudBound}
        cloudAttemptStatus={cloudAttemptStatus}
        usingEmulator={Boolean(firebaseHandle?.setup.emulatorBaseUrl)}
        onOpenSetup={() => setSetupOpen(true)}
      />

      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-12">
        <div id="local-itinerary" tabIndex={-1} className="lg:col-span-6">
          <ItineraryPane
            trip={activeTrip}
            evaluation={evaluation}
            syncStatus="local_only"
            localSaveStatus={localSaveStatus}
            onRetryLocalSave={retryLocalSave}
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
