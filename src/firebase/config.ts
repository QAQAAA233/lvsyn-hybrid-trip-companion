import type { FirebaseOptions } from 'firebase/app';

export interface RuntimeFirebaseSetup {
  config: FirebaseOptions;
  isLiveProject: boolean;
  emulatorBaseUrl: string;
  appCheckDebugToken: string;
  recaptchaSiteKey: string;
  cloudModel: string;
}

const STORAGE_KEY = 'lvsyn_hybrid_firebase_config_v1';

const LOCAL_PLACEHOLDER_CONFIG: FirebaseOptions = {
  apiKey: 'local-dev-only-not-a-secret',
  authDomain: 'local-hybrid-demo.firebaseapp.com',
  projectId: 'local-hybrid-demo',
  appId: '1:000000000000:web:localdemo',
};

export interface StoredFirebaseOverride {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  appCheckDebugToken?: string;
  recaptchaSiteKey?: string;
  cloudModel?: string;
  emulatorBaseUrl?: string;
}

export function loadStoredFirebaseOverride(): StoredFirebaseOverride | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredFirebaseOverride) : null;
  } catch {
    return null;
  }
}

export function saveStoredFirebaseOverride(override: StoredFirebaseOverride | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!override) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(override));
}

export function getRuntimeFirebaseConfig(): RuntimeFirebaseSetup {
  const stored = loadStoredFirebaseOverride();

  const envApiKey = (import.meta.env?.VITE_FIREBASE_API_KEY as string | undefined)?.trim() || '';
  const envProjectId = (import.meta.env?.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() || '';
  const envAppId = (import.meta.env?.VITE_FIREBASE_APP_ID as string | undefined)?.trim() || '';

  const apiKey = (stored?.apiKey ?? envApiKey).trim();
  const projectId = (stored?.projectId ?? envProjectId).trim();
  const appId = (stored?.appId ?? envAppId).trim();

  const hasExplicitProject = Boolean(
    apiKey &&
      projectId &&
      appId &&
      apiKey !== LOCAL_PLACEHOLDER_CONFIG.apiKey &&
      projectId !== LOCAL_PLACEHOLDER_CONFIG.projectId
  );

  const config: FirebaseOptions = hasExplicitProject
    ? {
        apiKey,
        authDomain:
          (stored?.authDomain ?? (import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? `${projectId}.firebaseapp.com`).trim(),
        projectId,
        storageBucket:
          (stored?.storageBucket ?? (import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? '').trim() || undefined,
        messagingSenderId:
          (stored?.messagingSenderId ?? (import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? '').trim() || undefined,
        appId,
      }
    : LOCAL_PLACEHOLDER_CONFIG;

  const emulatorBaseUrl = (
    stored?.emulatorBaseUrl ??
    (import.meta.env?.VITE_AI_EMULATOR_URL as string | undefined) ??
    ''
  ).trim();

  const appCheckDebugToken = (
    stored?.appCheckDebugToken ??
    (import.meta.env?.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) ??
    ''
  ).trim();

  const recaptchaSiteKey = (
    stored?.recaptchaSiteKey ??
    (import.meta.env?.VITE_APPCHECK_RECAPTCHA_SITE_KEY as string | undefined) ??
    ''
  ).trim();

  const cloudModel = (
    stored?.cloudModel ??
    (import.meta.env?.VITE_CLOUD_MODEL as string | undefined) ??
    'gemini-3.5-flash-lite'
  ).trim();

  return {
    config,
    isLiveProject: hasExplicitProject,
    emulatorBaseUrl,
    appCheckDebugToken,
    recaptchaSiteKey,
    cloudModel,
  };
}
