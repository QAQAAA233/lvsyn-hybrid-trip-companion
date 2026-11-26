import type { FirebaseOptions } from 'firebase/app';

export const REQ211_MODEL = 'gemini-3.5-flash-lite';
export const CLOUD_APP_NAME = 'req211-hybrid-trip-spark';
export const LOCAL_APP_NAME = 'req211-hybrid-trip-local';
export const LOCAL_OPTIONS: FirebaseOptions = Object.freeze({
  apiKey: 'local-dev-only-not-a-secret',
  projectId: 'local-hybrid-demo',
  appId: '1:000000000000:web:localdemo',
});

export interface RuntimeFirebaseSetup {
  isLiveProject: boolean;
  emulatorBaseUrl: '';
}
export interface CloudBinding {
  projectId: string;
  appId: string;
  apiKey: string;
  enterpriseSiteKey: string;
}

// Owner only sets these at build time after checking the exact same unlinked Spark project
// and enforced App Check. A receipt hash is a reference, not a Console authority assertion.
export function readCompetitionBinding(env: Record<string, unknown> = {}): CloudBinding | null {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const enterpriseSiteKey = env.VITE_REQ211_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const receipt = env.VITE_REQ211_OWNER_RECEIPT_SHA256;
  const fingerprint = env.VITE_REQ211_APPROVED_BINDING_SHA256;
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
      projectId === LOCAL_OPTIONS.projectId || projectId !== env.VITE_REQ211_APPROVED_PROJECT_ID ||
      typeof appId !== 'string' || !/^1:[1-9][0-9]{5,19}:web:[0-9a-f]{10,64}$/.test(appId) ||
      appId !== env.VITE_REQ211_APPROVED_WEB_APP_ID ||
      typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,120}$/.test(apiKey) ||
      typeof enterpriseSiteKey !== 'string' || !/^[A-Za-z0-9_-]{20,120}$/.test(enterpriseSiteKey) ||
      typeof receipt !== 'string' || !/^[0-9a-f]{64}$/.test(receipt) ||
      typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint) ||
      env.VITE_APPCHECK_DEBUG_TOKEN || env.VITE_AI_EMULATOR_URL) return null;
  return Object.freeze({projectId, appId, apiKey, enterpriseSiteKey});
}

export async function confirmCompetitionBinding(env: Record<string, unknown>): Promise<CloudBinding | null> {
  const binding = readCompetitionBinding(env);
  if (!binding || !globalThis.crypto?.subtle) return null;
  const encoded = new TextEncoder().encode(JSON.stringify([
    binding.projectId, binding.appId, binding.apiKey, binding.enterpriseSiteKey,
  ]));
  try {
    const checked = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(checked), b => b.toString(16).padStart(2, '0')).join('');
    return hex === env.VITE_REQ211_APPROVED_BINDING_SHA256 ? binding : null;
  } catch { return null; }
}
