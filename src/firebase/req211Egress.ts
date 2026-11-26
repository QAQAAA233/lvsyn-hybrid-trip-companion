import { REQ211_MODEL, type CloudBinding } from './config';

const GATEWAY = 'https://firebasevertexai.googleapis.com';
const MIN_TTL_MS = 60_000;
export const REQ211_FETCH_TIMEOUT_MS = 15_000;

type Permit = { binding: CloudBinding; token: string; prompt: string; until: number; used: boolean };
let permit: Permit | undefined;

function claimsMatch(token: string, appId: string, now: number): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const projectNumber = appId.split(':')[1];
    return payload.sub === appId &&
      payload.iss === 'https://firebaseappcheck.googleapis.com/' + projectNumber &&
      Array.isArray(payload.aud) && payload.aud.includes('projects/' + projectNumber) &&
      Number.isSafeInteger(payload.exp) && payload.exp * 1000 - now >= MIN_TTL_MS;
  } catch { return false; }
}

export async function withCompetitionPermit<T>(
  binding: CloudBinding, token: string, prompt: string, send: () => Promise<T>
): Promise<T> {
  if (permit) throw new Error('REQ211_CLOUD_BUSY');
  if (!claimsMatch(token, binding.appId, Date.now())) throw new Error('REQ211_APP_CHECK_UNAVAILABLE');
  permit = {binding, token, prompt, until: Date.now() + REQ211_FETCH_TIMEOUT_MS, used: false};
  try { return await send(); } finally { permit = undefined; }
}

// Called only at the hashed AI SDK's model-transport call site, never globally installed.
export async function req211GuardedModelFetch(url: string, init: RequestInit): Promise<Response> {
  const current = permit;
  const headers = new Headers(init.headers);
  const expected = current && GATEWAY + '/v1beta/projects/' + current.binding.projectId +
    '/models/' + REQ211_MODEL + ':streamGenerateContent?alt=sse';
  if (!current || current.used || Date.now() >= current.until || init.signal?.aborted ||
      init.method !== 'POST' || url !== expected || headers.has('authorization') ||
      headers.get('x-goog-api-key') !== current.binding.apiKey ||
      headers.get('x-firebase-appcheck') !== current.token ||
      !claimsMatch(current.token, current.binding.appId, Date.now())) {
    throw new Error('REQ211_MODEL_EGRESS_REFUSED');
  }
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const content = body?.contents?.[0];
  if (!body || Object.keys(body).some(k => !['contents', 'generationConfig', 'safetySettings'].includes(k)) ||
      JSON.stringify(body.generationConfig ?? {}) !== '{}' ||
      JSON.stringify(body.safetySettings ?? []) !== '[]' ||
      !Array.isArray(body.contents) || body.contents.length !== 1 ||
      content?.role !== 'user' || content.parts?.length !== 1 ||
      Object.keys(content.parts[0]).length !== 1 || content.parts[0].text !== current.prompt) {
    throw new Error('REQ211_TEXT_ONLY');
  }
  current.used = true;
  return globalThis.fetch(url, {...init, redirect: 'error', credentials: 'omit'});
}
