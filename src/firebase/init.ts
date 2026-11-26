import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, InferenceMode, type AI } from 'firebase/ai';
import {
  getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck,
} from 'firebase/app-check';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { AppCheckMode } from '../domain/proposal';
import {
  CLOUD_APP_NAME, LOCAL_APP_NAME, LOCAL_OPTIONS, REQ211_MODEL, confirmCompetitionBinding,
  type CloudBinding, type RuntimeFirebaseSetup,
} from './config';
import { withCompetitionPermit } from './req211Egress';

export interface RemoteConfigPolicy {
  defaultInferenceMode: InferenceMode;
  cloudFallbackModel: typeof REQ211_MODEL;
  privacyVaultStrictLocal: true;
  source: 'fixed_contest_policy';
}
export interface FirebaseRuntimeHandle {
  setup: RuntimeFirebaseSetup;
  ai: AI;
  appCheckMode: AppCheckMode;
  remotePolicy: RemoteConfigPolicy;
  firestore: Firestore | null;
  auth: Auth | null;
  runApprovedCloud<T>(prompt: string, run: (ai: AI, signal: AbortSignal) => Promise<T>): Promise<T>;
}

type AppCheckInitializer = (app: FirebaseApp, binding: CloudBinding) => AppCheck;
function startEnterprise(app: FirebaseApp, binding: CloudBinding): AppCheck {
  if (typeof window === 'undefined') throw new Error('REQ211_APP_CHECK_UNAVAILABLE');
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(binding.enterpriseSiteKey),
    isTokenAutoRefreshEnabled: false,
  });
}

function debugEnabled(): boolean {
  const g = globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown };
  return Boolean(g.FIREBASE_APPCHECK_DEBUG_TOKEN);
}
function matches(app: FirebaseApp, binding: CloudBinding): boolean {
  const o = app.options;
  return app.name === CLOUD_APP_NAME && o.projectId === binding.projectId &&
    o.appId === binding.appId && o.apiKey === binding.apiKey;
}

function sameAppToken(appCheck: AppCheck): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REQ211_APP_CHECK_UNAVAILABLE')), 8_000);
    getToken(appCheck).then(({token}) => {
      clearTimeout(timer);
      resolve(token);
    }, () => {
      clearTimeout(timer);
      reject(new Error('REQ211_APP_CHECK_UNAVAILABLE'));
    });
  });
}

let localOwned: FirebaseApp | undefined;
export async function createCompetitionRuntime(
  env: Record<string, unknown>,
  appCheckInitializer: AppCheckInitializer = startEnterprise,
): Promise<FirebaseRuntimeHandle> {
  const existingLocal = getApps().find(app => app.name === LOCAL_APP_NAME);
  if (existingLocal && existingLocal !== localOwned) throw new Error('REQ211_LOCAL_APP_COLLISION');
  const localApp = existingLocal ?? (localOwned = initializeApp(LOCAL_OPTIONS, LOCAL_APP_NAME));
  const ai = getAI(localApp, {backend: new GoogleAIBackend()});
  const binding = await confirmCompetitionBinding(env);
  let approved: {app: FirebaseApp; appCheck: AppCheck; ai: AI; binding: CloudBinding} | undefined;
  if (binding && !debugEnabled() && !getApps().some(app => app.name === CLOUD_APP_NAME)) {
    try {
      const app = initializeApp({projectId: binding.projectId, appId: binding.appId,
        apiKey: binding.apiKey}, CLOUD_APP_NAME);
      const appCheck = appCheckInitializer(app, binding);
      if (matches(app, binding) && appCheck.app === app) {
        approved = {app, appCheck, ai: getAI(app, {backend: new GoogleAIBackend()}), binding};
      }
    } catch {
      // No fallback to an existing/default app or a different provider.
    }
  }
  return {
    setup: {isLiveProject: Boolean(approved), emulatorBaseUrl: ''},
    ai,
    appCheckMode: approved ? 'recaptcha_enterprise' : 'unconfigured',
    remotePolicy: {defaultInferenceMode: InferenceMode.PREFER_ON_DEVICE,
      cloudFallbackModel: REQ211_MODEL, privacyVaultStrictLocal: true, source: 'fixed_contest_policy'},
    firestore: null, auth: null, // This contest copy keeps trip data local.
    async runApprovedCloud(prompt, run) {
      if (!approved || debugEnabled()) throw new Error('REQ211_APP_CHECK_UNAVAILABLE');
      const {app, appCheck, ai: approvedAi, binding: locked} = approved;
      if (!getApps().includes(app) || !matches(app, locked) || appCheck.app !== app ||
        approvedAi.app !== app) throw new Error('REQ211_APP_IDENTITY_CHANGED');
      const token = await sameAppToken(appCheck);
      if (debugEnabled() || !getApps().includes(app))
        throw new Error('REQ211_APP_IDENTITY_CHANGED');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      try {
        return await withCompetitionPermit(locked, token, prompt, () => run(approvedAi, controller.signal));
      } finally { clearTimeout(timer); }
    },
  };
}

let cached: Promise<FirebaseRuntimeHandle> | undefined;
export async function initializeFirebaseServices(): Promise<FirebaseRuntimeHandle> {
  return cached ??= createCompetitionRuntime(import.meta.env ?? {});
}
