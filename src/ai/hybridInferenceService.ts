import { setLogLevel } from 'firebase/app';
import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type AI,
  type HybridParams,
  type Part,
  type RequestOptions,
} from 'firebase/ai';
import type { AppCheckMode, InferenceTelemetry, TaskKind } from '../domain/proposal';
import type { FirebaseRuntimeHandle } from '../firebase/init';
import { REQ211_MODEL } from '../firebase/config';
import { REQ211_FETCH_TIMEOUT_MS } from '../firebase/req211Egress';

export type LocalModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

interface LanguageModelProviderLike {
  availability?: (opts?: unknown) => Promise<string>;
}

export interface HybridExecutionRequest {
  ai: AI;
  taskKind: TaskKind;
  requestedMode: InferenceMode;
  cloudModel: string;
  emulatorBaseUrl?: string;
  appCheckMode: AppCheckMode;
  prompt: string;
  imageAttachment?: {
    base64Data: string;
    mimeType: 'image/png' | 'image/jpeg';
  };
  systemInstruction?: string;
  competitionCloudSignal?: AbortSignal;
}

export interface HybridExecutionResult {
  text: string;
  telemetry: InferenceTelemetry;
}

export function setFirebaseDebugLogging(enabled: boolean): void {
  setLogLevel(enabled ? 'debug' : 'silent');
}

if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__lvsynSetFirebaseLogLevel = setFirebaseDebugLogging;
}

function getGlobalLanguageModel(): LanguageModelProviderLike | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelProviderLike }).LanguageModel;
}

export async function checkOnDeviceAvailability(
  includeImage = false
): Promise<LocalModelAvailability> {
  const lm = getGlobalLanguageModel();
  if (!lm || typeof lm.availability !== 'function') {
    return 'unavailable';
  }

  try {
    const expectedInputs = includeImage
      ? [{ type: 'text', languages: ['en'] }, { type: 'image' }]
      : [{ type: 'text', languages: ['en'] }];
    const result = await Promise.race<string>([
      lm.availability({
        expectedInputs,
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('unavailable'), 3500)
      ),
    ]);
    if (
      result === 'available' ||
      result === 'downloadable' ||
      result === 'downloading'
    ) {
      return result;
    }
    return 'unavailable';
  } catch {
    // Do not downgrade image capability checks to text-only availability.
    return 'unavailable';
  }
}

export async function initializeOnDeviceModel(
  ai: AI,
  cloudModel: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
    },
    inCloudParams: {
      model: cloudModel,
    },
  });

  await model.initializeDeviceModel((progressValue) => {
    onProgress(Math.min(100, Math.max(0, Math.round(progressValue * 100))));
  });
}

const NATIVE_PROMPT_BUDGET_MS = 30_000;
// Do not start a second native task until the previous SDK stream actually settles.
const nativeInFlight = new WeakSet<AI>();

export async function runHybridPrompt(
  req: HybridExecutionRequest,
  onChunk: (accumulatedText: string) => void
): Promise<HybridExecutionResult> {
  const startedAt = performance.now();
  const onlineAtStart = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const hasImage = Boolean(req.imageAttachment);
  const effectiveMode =
    req.taskKind === 'privacy_vault'
      ? InferenceMode.ONLY_ON_DEVICE
      : req.requestedMode;

  const nativeOnly = effectiveMode === InferenceMode.ONLY_ON_DEVICE;
  const nativeAbort = nativeOnly ? new AbortController() : undefined;
  const signal = nativeAbort?.signal;
  // Firebase 3.1.0 forwards promptOptions as-is. Chrome supports signal here,
  // while this SDK's older Prompt Options interface declares responseConstraint.
  const nativePromptOptions = signal ? { responseConstraint: undefined, signal } : undefined;
  const hybridParams: HybridParams = {
    mode: effectiveMode,
    onDeviceParams: {
      ...(nativePromptOptions ? { promptOptions: nativePromptOptions } : {}),
      createOptions: {
        ...(signal ? { signal } : {}),
        expectedInputs: hasImage
          ? [{ type: 'text', languages: ['en'] }, { type: 'image' }]
          : [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
    },
    inCloudParams: {
      model: req.cloudModel,
      ...(req.systemInstruction ? { systemInstruction: req.systemInstruction } : {}),
    },
  };

  const requestOptions: RequestOptions | undefined = req.competitionCloudSignal
    ? { timeout: REQ211_FETCH_TIMEOUT_MS }
    : req.emulatorBaseUrl ? { baseUrl: req.emulatorBaseUrl } : undefined;

  const parts: Array<string | Part> = [req.prompt];
  if (req.imageAttachment) {
    if (req.imageAttachment.mimeType !== 'image/png' && req.imageAttachment.mimeType !== 'image/jpeg') {
      throw new Error('REQ211_UNSUPPORTED_IMAGE_MIME');
    }
    parts.push({
      type: 'inlineData',
      inlineData: {
        data: req.imageAttachment.base64Data,
        mimeType: req.imageAttachment.mimeType,
      },
    });
  }

  let ttftMs: number | null = null;
  let accumulated = '';
  let blockedBeforeDispatch = false;
  let downloadRequired = false;
  let sourceUnverified = false;
  let terminalTextMissing = false;
  let timedOut = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const consumeSdkTerminal = async () => {
    // Guard against @firebase/ai@3.1.0 falling back to cloud when globalThis.LanguageModel is absent
    // (chromeAdapterFactory returns undefined, bypassing ONLY_ON_DEVICE checks inside callHybrid).
    if (effectiveMode === InferenceMode.ONLY_ON_DEVICE) {
      const localStatus = await checkOnDeviceAvailability(hasImage);
      if (localStatus === 'downloadable' || localStatus === 'downloading') {
        downloadRequired = true;
        throw new Error('REQ211_NANO_DOWNLOAD_REQUIRED');
      }
      if (localStatus !== 'available') {
        blockedBeforeDispatch = true;
        throw new Error(
          `Local Privacy Shield blocked cloud transmission (on-device model is "${localStatus}").`
        );
      }
    }

    signal?.throwIfAborted();
    const model = getGenerativeModel(req.ai, hybridParams, requestOptions);
    const streamResult = await model.generateContentStream(parts,
      req.competitionCloudSignal ? {signal: req.competitionCloudSignal} : undefined);
    // A stream failure also rejects the SDK response promise. Observe it now,
    // then await the original result below so its error remains the caller's.
    const responsePromise = streamResult.response;
    void responsePromise.catch(() => undefined);

    for await (const chunk of streamResult.stream) {
      signal?.throwIfAborted();
      const piece = chunk.text();
      if (piece) {
        if (ttftMs === null) {
          ttftMs = Math.round(performance.now() - startedAt);
        }
        accumulated += piece;
        onChunk(accumulated);
      }
    }

    const finalResponse = await responsePromise;
    signal?.throwIfAborted();
    // Requested mode, network status and streamed text are not source evidence.
    const source = finalResponse.inferenceSource;
    if ((source !== InferenceSource.ON_DEVICE && source !== InferenceSource.IN_CLOUD) ||
        (effectiveMode === InferenceMode.ONLY_ON_DEVICE && source !== InferenceSource.ON_DEVICE) ||
        (effectiveMode === InferenceMode.ONLY_IN_CLOUD && source !== InferenceSource.IN_CLOUD)) {
      sourceUnverified = true;
      throw new Error('REQ211_INFERENCE_SOURCE_UNVERIFIED');
    }
    const text = finalResponse.text();
    if (typeof text !== 'string' || !text.trim()) {
      terminalTextMissing = true;
      throw new Error('REQ211_TERMINAL_TEXT_MISSING');
    }
    // Do not promote a partial stream into a completed result.
    const actualSource: InferenceSource | 'local_emulator' = source === InferenceSource.IN_CLOUD && req.emulatorBaseUrl && !req.competitionCloudSignal
      ? 'local_emulator' : source;
    return { text, actualSource };
  };

  try {
    if (nativeOnly && nativeInFlight.has(req.ai)) {
      throw new Error('REQ211_NATIVE_DRAINING');
    }
    if (nativeOnly) nativeInFlight.add(req.ai);
    const task = consumeSdkTerminal();
    if (nativeAbort) {
      const release = () => {
        nativeInFlight.delete(req.ai);
        if (!nativeAbort.signal.aborted) nativeAbort.abort();
      };
      // Detach for UI timeout, but keep the physical device slot until settled.
      void task.then(release, release);
    }
    const timeout = nativeAbort ? new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        timedOut = true;
        const error = new Error('REQ211_NATIVE_TIME_LIMIT');
        nativeAbort.abort(error);
        reject(error);
      }, NATIVE_PROMPT_BUDGET_MS);
    }) : undefined;
    const { text, actualSource } = timeout ? await Promise.race([task, timeout]) : await task;
    const totalMs = Math.max(1, Math.round(performance.now() - startedAt));

    return {
      text,
      telemetry: {
        id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        taskKind: req.taskKind,
        requestedMode: effectiveMode,
        actualSource,
        sourceEvidence: 'sdk_terminal_response',
        modelLabel:
          actualSource === InferenceSource.ON_DEVICE
            ? 'Gemini Nano (Chrome Built-in AI)'
            : req.emulatorBaseUrl
              ? `${req.cloudModel} (Local Cloud Emulator)`
              : req.cloudModel,
        onlineAtStart,
        appCheckMode: req.appCheckMode,
        ttftMs: ttftMs ?? totalMs,
        totalMs,
        estimatedCloudCostUsd: actualSource === InferenceSource.ON_DEVICE || actualSource === 'local_emulator' ? 0 : null,
        inputModalities: hasImage ? ['text', 'image'] : ['text'],
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    const totalMs = Math.max(1, Math.round(performance.now() - startedAt));
    const upstreamStatus = req.competitionCloudSignal
      ? (err as {customErrorData?: {status?: number}} | null)?.customErrorData?.status : undefined;
    const safeCloudMessage = upstreamStatus === 429 ? 'REQ211_CLOUD_QUOTA_STOP'
      : upstreamStatus === 403 ? 'REQ211_CLOUD_PERMISSION_STOP' : 'REQ211_CLOUD_STOP';
    const message = timedOut ? 'REQ211_NATIVE_TIME_LIMIT' :
      sourceUnverified ? 'REQ211_INFERENCE_SOURCE_UNVERIFIED' :
      terminalTextMissing ? 'REQ211_TERMINAL_TEXT_MISSING' :
      req.competitionCloudSignal ? safeCloudMessage : err instanceof Error ? err.message : String(err);

    const telemetry: InferenceTelemetry = {
      id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      taskKind: req.taskKind,
      requestedMode: effectiveMode,
      actualSource: sourceUnverified ? 'source_unverified' : blockedBeforeDispatch ? 'blocked_offline_privacy' : 'error',
      modelLabel: sourceUnverified ? 'Inference source not verified' :
        downloadRequired ? 'Gemini Nano download required' :
        blockedBeforeDispatch ? 'Blocked before model dispatch' : 'No completed model result',
      onlineAtStart,
      appCheckMode: req.appCheckMode,
      ttftMs: null,
      totalMs,
      estimatedCloudCostUsd: blockedBeforeDispatch || downloadRequired ? 0 : null,
      inputModalities: hasImage ? ['text', 'image'] : ['text'],
      timestamp: Date.now(),
    };

    const enriched = new Error(message) as Error & { telemetry?: InferenceTelemetry };
    enriched.telemetry = telemetry;
    throw enriched;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}

// The React application only calls this route. Legacy runHybridPrompt stays testable for
// the original emulator suite, but in a browser build its bare SDK egress is denied.
type CompetitionPrompt = Pick<HybridExecutionRequest,
  'taskKind' | 'requestedMode' | 'prompt' | 'imageAttachment'>;

export async function runCompetitionPrompt(
  handle: FirebaseRuntimeHandle, request: CompetitionPrompt,
  onChunk: (accumulatedText: string) => void,
): Promise<HybridExecutionResult> {
  const {taskKind, requestedMode, prompt, imageAttachment} = request;
  const req = {taskKind, prompt, cloudModel: REQ211_MODEL, appCheckMode: handle.appCheckMode};
  const local = () => runHybridPrompt({...req, imageAttachment, ai: handle.ai,
    requestedMode: InferenceMode.ONLY_ON_DEVICE}, onChunk);
  if (taskKind === 'privacy_vault' || imageAttachment || requestedMode === InferenceMode.ONLY_ON_DEVICE) {
    if (imageAttachment && requestedMode === InferenceMode.ONLY_IN_CLOUD && taskKind !== 'privacy_vault') {
      throw new Error('REQ211_CLOUD_TEXT_ONLY');
    }
    return local();
  }
  if (![InferenceMode.PREFER_ON_DEVICE, InferenceMode.PREFER_IN_CLOUD, InferenceMode.ONLY_IN_CLOUD].includes(requestedMode)) {
    throw new Error('REQ211_INFERENCE_MODE_INVALID');
  }
  // In the contest build, a local preference is not explicit cloud selection.
  // Any local failure is final for this invocation, even before the first chunk.
  if (requestedMode === InferenceMode.PREFER_ON_DEVICE) return local();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('REQ211_CLOUD_OFFLINE_STOP');
  }
  if (!handle.setup.isLiveProject) throw new Error('REQ211_APP_CHECK_UNAVAILABLE');
  return handle.runApprovedCloud(prompt, (ai, signal) =>
    runHybridPrompt({...req, ai, requestedMode: InferenceMode.ONLY_IN_CLOUD, competitionCloudSignal: signal}, onChunk));
}
