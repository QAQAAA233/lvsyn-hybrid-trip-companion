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
      ? [{ type: 'text' }, { type: 'image' }]
      : [{ type: 'text' }];
    const result = await Promise.race<string>([
      lm.availability({
        expectedInputs,
        expectedOutputs: [{ type: 'text' }],
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
    if (includeImage) {
      return checkOnDeviceAvailability(false);
    }
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
        expectedInputs: [{ type: 'text' }],
        expectedOutputs: [{ type: 'text' }],
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

  const hybridParams: HybridParams = {
    mode: effectiveMode,
    onDeviceParams: {
      createOptions: {
        expectedInputs: hasImage
          ? [{ type: 'text' }, { type: 'image' }]
          : [{ type: 'text' }],
        expectedOutputs: [{ type: 'text' }],
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

  const model = getGenerativeModel(req.ai, hybridParams, requestOptions);

  const parts: Array<string | Part> = [req.prompt];
  if (req.imageAttachment) {
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

  try {
    // Guard against @firebase/ai@3.1.0 falling back to cloud when globalThis.LanguageModel is absent
    // (chromeAdapterFactory returns undefined, bypassing ONLY_ON_DEVICE checks inside callHybrid).
    if (effectiveMode === InferenceMode.ONLY_ON_DEVICE) {
      const localStatus = await checkOnDeviceAvailability(hasImage);
      if (localStatus !== 'available') {
        throw new Error(
          `Local Privacy Shield blocked cloud transmission (on-device model is "${localStatus}").`
        );
      }
    }

    const streamResult = await model.generateContentStream(parts,
      req.competitionCloudSignal ? {signal: req.competitionCloudSignal} : undefined);
    // A stream failure also rejects the SDK response promise. Observe it now,
    // then await the original result below so its error remains the caller's.
    const responsePromise = streamResult.response;
    void responsePromise.catch(() => undefined);

    for await (const chunk of streamResult.stream) {
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
    const finalText = finalResponse.text() || accumulated;
    const actualSource = finalResponse.inferenceSource ?? InferenceSource.IN_CLOUD;
    const totalMs = Math.max(1, Math.round(performance.now() - startedAt));

    return {
      text: finalText,
      telemetry: {
        id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        taskKind: req.taskKind,
        requestedMode: effectiveMode,
        actualSource,
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
        estimatedCloudCostUsd: actualSource === InferenceSource.ON_DEVICE || req.competitionCloudSignal ? 0 : 0.0002,
        inputModalities: hasImage ? ['text', 'image'] : ['text'],
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    const totalMs = Math.max(1, Math.round(performance.now() - startedAt));
    const isPrivacyBlocked = effectiveMode === InferenceMode.ONLY_ON_DEVICE;
    const upstreamStatus = req.competitionCloudSignal
      ? (err as {customErrorData?: {status?: number}} | null)?.customErrorData?.status : undefined;
    const safeCloudMessage = upstreamStatus === 429 ? 'REQ211_CLOUD_QUOTA_STOP'
      : upstreamStatus === 403 ? 'REQ211_CLOUD_PERMISSION_STOP' : 'REQ211_CLOUD_STOP';
    const message = req.competitionCloudSignal ? safeCloudMessage : err instanceof Error ? err.message : String(err);

    const telemetry: InferenceTelemetry = {
      id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      taskKind: req.taskKind,
      requestedMode: effectiveMode,
      actualSource: isPrivacyBlocked ? 'blocked_offline_privacy' : 'error',
      modelLabel: isPrivacyBlocked
        ? 'Blocked locally (0 bytes sent to cloud)'
        : req.cloudModel,
      onlineAtStart,
      appCheckMode: req.appCheckMode,
      ttftMs: null,
      totalMs,
      estimatedCloudCostUsd: 0,
      inputModalities: hasImage ? ['text', 'image'] : ['text'],
      timestamp: Date.now(),
    };

    const enriched = new Error(message) as Error & { telemetry?: InferenceTelemetry };
    enriched.telemetry = telemetry;
    throw enriched;
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
  if (requestedMode === InferenceMode.PREFER_IN_CLOUD && !handle.setup.isLiveProject) return local();
  return handle.runApprovedCloud(prompt, (ai, signal) =>
    runHybridPrompt({...req, ai, requestedMode: InferenceMode.ONLY_IN_CLOUD, competitionCloudSignal: signal}, onChunk));
}
