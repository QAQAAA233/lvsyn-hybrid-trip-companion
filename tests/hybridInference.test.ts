import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { getAI, GoogleAIBackend, InferenceMode, InferenceSource, type AI } from 'firebase/ai';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { checkOnDeviceAvailability, runHybridPrompt } from '../src/ai/hybridInferenceService';
import {
  startCloudEmulatorServer,
  type CloudEmulatorHandle,
} from '../scripts/local-cloud-emulator.mjs';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function installMockLanguageModel(mode: 'available' | 'unavailable'): void {
  const target = globalThis as Record<string, unknown>;
  if (mode === 'unavailable') {
    delete target.LanguageModel;
    return;
  }

  target.LanguageModel = {
    async availability() {
      return 'available';
    },
    async create() {
      return {
        async prompt() {
          return 'On-device Gemini Nano response: Step-free museum is open Tuesday 09:30-17:30.';
        },
        promptStreaming() {
          return new ReadableStream<string>({
            start(controller) {
              controller.enqueue('On-device Gemini Nano response: ');
              controller.enqueue('Step-free museum is open Tuesday 09:30-17:30.');
              controller.close();
            },
          });
        },
        destroy() {},
      };
    },
  };
}

describe('Firebase AI Logic Hybrid Inference SDK Contract', () => {
  let emulator: CloudEmulatorHandle;
  let ai: AI;
  let originalCreateImageBitmap: unknown;

  beforeAll(async () => {
    const g = globalThis as Record<string, unknown>;
    originalCreateImageBitmap = g.createImageBitmap;
    if (!g.createImageBitmap) {
      g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
    }

    emulator = await startCloudEmulatorServer(0);
    const app = initializeApp(
      {
        apiKey: 'local-dev-only-not-a-secret',
        projectId: 'local-hybrid-contract-test',
        appId: '1:000000000000:web:contracttest',
      },
      'hybrid-contract-app'
    );

    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => ({
          token: 'test-appcheck-debug-token',
          expireTimeMillis: Date.now() + 3600_000,
        }),
      }),
      isTokenAutoRefreshEnabled: false,
    });

    ai = getAI(app, { backend: new GoogleAIBackend() });
  });

  afterAll(async () => {
    const g = globalThis as Record<string, unknown>;
    delete g.LanguageModel;
    if (originalCreateImageBitmap === undefined) {
      delete g.createImageBitmap;
    } else {
      g.createImageBitmap = originalCreateImageBitmap;
    }
    for (const app of getApps()) {
      await deleteApp(app);
    }
    if (emulator) {
      await emulator.close();
    }
  });

  beforeEach(() => {
    emulator.resetRequests();
    delete (globalThis as Record<string, unknown>).LanguageModel;
  });

  it('routes PREFER_ON_DEVICE locally via ChromeAdapter when LanguageModel is available with 0 cloud requests', async () => {
    installMockLanguageModel('available');
    const chunks: string[] = [];

    const result = await runHybridPrompt(
      {
        ai,
        taskKind: 'concierge',
        requestedMode: InferenceMode.PREFER_ON_DEVICE,
        cloudModel: 'gemini-3.5-flash-lite',
        emulatorBaseUrl: emulator.url,
        appCheckMode: 'local_emulator_provider',
        prompt: 'Summarize afternoon stops for senior parents.',
      },
      (text) => chunks.push(text)
    );

    expect(result.telemetry.actualSource).toBe(InferenceSource.ON_DEVICE);
    expect(result.text).toContain('On-device Gemini Nano');
    expect(chunks.length).toBeGreaterThan(0);
    expect(emulator.getRequests()).toHaveLength(0);
  });

  it('falls back to the local emulator with the App Check and hybrid headers without claiming real cloud', async () => {
    installMockLanguageModel('unavailable');

    const result = await runHybridPrompt(
      {
        ai,
        taskKind: 'schedule_optimize',
        requestedMode: InferenceMode.PREFER_ON_DEVICE,
        cloudModel: 'gemini-3.5-flash-lite',
        emulatorBaseUrl: emulator.url,
        appCheckMode: 'local_emulator_provider',
        prompt: 'LvSyn Hybrid Schedule Optimizer kyoto-stop-2 patchOps',
      },
      () => {}
    );

    expect(result.telemetry.actualSource).toBe('local_emulator');
    expect(result.telemetry.estimatedCloudCostUsd).toBe(0);
    expect(result.text).toContain('patchOps');

    const cloudCalls = emulator.getRequests();
    expect(cloudCalls).toHaveLength(1);
    expect(cloudCalls[0].hasAppCheckHeader).toBe(true);
    expect(cloudCalls[0].appCheckHeader).toBe('test-appcheck-debug-token');
    expect(String(cloudCalls[0].googApiClient)).toContain('hybrid');
  });

  it('enforces ONLY_ON_DEVICE Privacy Shield and blocks cloud leakage when LanguageModel is unavailable', async () => {
    installMockLanguageModel('unavailable');

    await expect(
      runHybridPrompt(
        {
          ai,
          taskKind: 'privacy_vault',
          requestedMode: InferenceMode.PREFER_ON_DEVICE,
          cloudModel: 'gemini-3.5-flash-lite',
          emulatorBaseUrl: emulator.url,
          appCheckMode: 'local_emulator_provider',
          prompt: 'Private medical medication schedule and room code',
        },
        () => {}
      )
    ).rejects.toThrow();

    expect(emulator.getRequests()).toHaveLength(0);
  });

  it('routes multimodal PNG inlineData locally or reports the local emulator when Nano is unavailable', async () => {
    installMockLanguageModel('available');
    const localVision = await runHybridPrompt(
      {
        ai,
        taskKind: 'sign_vision',
        requestedMode: InferenceMode.PREFER_ON_DEVICE,
        cloudModel: 'gemini-3.5-flash-lite',
        emulatorBaseUrl: emulator.url,
        appCheckMode: 'local_emulator_provider',
        prompt: 'Analyze travel sign image',
        imageAttachment: { base64Data: TINY_PNG_BASE64, mimeType: 'image/png' },
      },
      () => {}
    );
    expect(localVision.telemetry.actualSource).toBe(InferenceSource.ON_DEVICE);
    expect(emulator.getRequests()).toHaveLength(0);

    installMockLanguageModel('unavailable');
    const cloudVision = await runHybridPrompt(
      {
        ai,
        taskKind: 'sign_vision',
        requestedMode: InferenceMode.PREFER_ON_DEVICE,
        cloudModel: 'gemini-3.5-flash-lite',
        emulatorBaseUrl: emulator.url,
        appCheckMode: 'local_emulator_provider',
        prompt: 'Analyze travel sign image',
        imageAttachment: { base64Data: TINY_PNG_BASE64, mimeType: 'image/png' },
      },
      () => {}
    );
    expect(cloudVision.telemetry.actualSource).toBe('local_emulator');
    expect(cloudVision.telemetry.estimatedCloudCostUsd).toBe(0);
    expect(emulator.getRequests()).toHaveLength(1);
  });

  it('never reports image availability from text-only availability when multimodal check fails', async () => {
    const g = globalThis as Record<string, unknown>;
    g.LanguageModel = {
      async availability(opts?: { expectedInputs?: Array<{ type: string }> }) {
        const hasImage = opts?.expectedInputs?.some((i) => i.type === 'image');
        if (hasImage) throw new Error('Image modality unsupported');
        return 'available';
      },
    };
    expect(await checkOnDeviceAvailability(false)).toBe('available');
    expect(await checkOnDeviceAvailability(true)).toBe('unavailable');
  });

  it('rejects unsupported non-PNG/JPEG inline image MIME types without cloud egress', async () => {
    installMockLanguageModel('unavailable');
    await expect(
      runHybridPrompt(
        {
          ai,
          taskKind: 'sign_vision',
          requestedMode: InferenceMode.PREFER_ON_DEVICE,
          cloudModel: 'gemini-3.5-flash-lite',
          emulatorBaseUrl: emulator.url,
          appCheckMode: 'local_emulator_provider',
          prompt: 'Analyze attached document',
          imageAttachment: {
            base64Data: TINY_PNG_BASE64,
            mimeType: 'application/pdf' as 'image/png',
          },
        },
        () => {}
      )
    ).rejects.toThrow('REQ211_UNSUPPORTED_IMAGE_MIME');
    expect(emulator.getRequests()).toHaveLength(0);
  });
});
