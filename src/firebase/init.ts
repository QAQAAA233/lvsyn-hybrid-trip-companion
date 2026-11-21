import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, InferenceMode, type AI } from 'firebase/ai';
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import {
  fetchAndActivate,
  getBoolean,
  getRemoteConfig,
  getString,
  type RemoteConfig,
} from 'firebase/remote-config';
import type { AppCheckMode } from '../domain/proposal';
import { getRuntimeFirebaseConfig, type RuntimeFirebaseSetup } from './config';

export interface RemoteConfigPolicy {
  defaultInferenceMode: InferenceMode;
  cloudFallbackModel: string;
  privacyVaultStrictLocal: boolean;
  source: 'remote_config' | 'defaults';
}

export interface FirebaseRuntimeHandle {
  setup: RuntimeFirebaseSetup;
  app: FirebaseApp;
  ai: AI;
  appCheck: AppCheck | null;
  appCheckMode: AppCheckMode;
  remoteConfig: RemoteConfig | null;
  remotePolicy: RemoteConfigPolicy;
  firestore: Firestore | null;
  auth: Auth | null;
}

let cachedHandle: FirebaseRuntimeHandle | null = null;

function parseInferenceMode(value: string): InferenceMode {
  switch (value) {
    case InferenceMode.ONLY_ON_DEVICE:
      return InferenceMode.ONLY_ON_DEVICE;
    case InferenceMode.ONLY_IN_CLOUD:
      return InferenceMode.ONLY_IN_CLOUD;
    case InferenceMode.PREFER_IN_CLOUD:
      return InferenceMode.PREFER_IN_CLOUD;
    default:
      return InferenceMode.PREFER_ON_DEVICE;
  }
}

export async function initializeFirebaseServices(
  forceReinit = false
): Promise<FirebaseRuntimeHandle> {
  if (cachedHandle && !forceReinit) {
    return cachedHandle;
  }

  if (forceReinit) {
    for (const existing of getApps()) {
      await deleteApp(existing);
    }
    cachedHandle = null;
  }

  const setup = getRuntimeFirebaseConfig();
  const app = getApps()[0] ?? initializeApp(setup.config);

  let appCheck: AppCheck | null = null;
  let appCheckMode: AppCheckMode = 'unconfigured';

  if (typeof window !== 'undefined') {
    if (setup.appCheckDebugToken) {
      (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
        setup.appCheckDebugToken === 'true' ? true : setup.appCheckDebugToken;
    }

    if (setup.recaptchaSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(setup.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = setup.appCheckDebugToken ? 'debug_token' : 'recaptcha_v3';
    } else if (setup.emulatorBaseUrl) {
      appCheck = initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: async () => ({
            token: 'local-dev-appcheck-debug-token',
            expireTimeMillis: Date.now() + 60 * 60 * 1000,
          }),
        }),
        isTokenAutoRefreshEnabled: false,
      });
      appCheckMode = 'local_emulator_provider';
    } else if (setup.isLiveProject && setup.appCheckDebugToken) {
      appCheck = initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: async () => ({
            token:
              setup.appCheckDebugToken === 'true'
                ? 'debug-token-pending-console-registration'
                : setup.appCheckDebugToken,
            expireTimeMillis: Date.now() + 60 * 60 * 1000,
          }),
        }),
        isTokenAutoRefreshEnabled: false,
      });
      appCheckMode = 'debug_token';
    }
  }

  const ai = getAI(app, { backend: new GoogleAIBackend() });

  let remoteConfig: RemoteConfig | null = null;
  let remotePolicy: RemoteConfigPolicy = {
    defaultInferenceMode: InferenceMode.PREFER_ON_DEVICE,
    cloudFallbackModel: setup.cloudModel,
    privacyVaultStrictLocal: true,
    source: 'defaults',
  };

  if (typeof window !== 'undefined' && setup.isLiveProject) {
    try {
      remoteConfig = getRemoteConfig(app);
      remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
      remoteConfig.defaultConfig = {
        default_inference_mode: InferenceMode.PREFER_ON_DEVICE,
        cloud_fallback_model: setup.cloudModel,
        privacy_vault_strict_local: true,
      };
      if (navigator.onLine) {
        await fetchAndActivate(remoteConfig);
        remotePolicy = {
          defaultInferenceMode: parseInferenceMode(
            getString(remoteConfig, 'default_inference_mode')
          ),
          cloudFallbackModel:
            getString(remoteConfig, 'cloud_fallback_model') || setup.cloudModel,
          privacyVaultStrictLocal: getBoolean(
            remoteConfig,
            'privacy_vault_strict_local'
          ),
          source: 'remote_config',
        };
      }
    } catch {
      // Offline or unconfigured Remote Config falls back safely to defaults
    }
  }

  let firestore: Firestore | null = null;
  let auth: Auth | null = null;

  if (typeof window !== 'undefined' && setup.isLiveProject) {
    try {
      firestore = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      firestore = null;
    }

    try {
      auth = getAuth(app);
      if (navigator.onLine && !auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch {
      auth = null;
    }
  }

  cachedHandle = {
    setup,
    app,
    ai,
    appCheck,
    appCheckMode,
    remoteConfig,
    remotePolicy,
    firestore,
    auth,
  };

  return cachedHandle;
}
