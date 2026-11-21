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
    mode: InferenceMode.PREFER_ON_DEVICE,
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

  const requestOptions: RequestOptions | undefined = req.emulatorBaseUrl
    ? { baseUrl: req.emulatorBaseUrl }
    : undefined;

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

    const streamResult = await model.generateContentStream(parts);

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

    const finalResponse = await streamResult.response;
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
        estimatedCloudCostUsd: actualSource === InferenceSource.ON_DEVICE ? 0 : 0.0002,
        inputModalities: hasImage ? ['text', 'image'] : ['text'],
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    const totalMs = Math.max(1, Math.round(performance.now() - startedAt));
    const isPrivacyBlocked = effectiveMode === InferenceMode.ONLY_ON_DEVICE;
    const message = err instanceof Error ? err.message : String(err);

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
