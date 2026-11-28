/** Browser-side safety brake for this app, never a Firebase billing or provider quota cap. */
export const DAILY_CLOUD_ATTEMPT_LIMIT = 3;
export const CLOUD_ATTEMPT_KEY = 'hybrid-trip.cloud-attempts.v1';
const LOCK_NAME = 'hybrid-trip.cloud-attempts.v1.exclusive';
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem'>;
type BrowserBudget = {storage: AttemptStorage; locks: LockManager};
type Ledger = {version: 1; utcDay: string; attempts: number};
export type CloudAttemptStatus =
  | {state: 'available' | 'spent'; attempts: number; limit: number; utcDay: string}
  | {state: 'unavailable'; attempts: null; limit: number; utcDay: string};

function getBudget(): BrowserBudget | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    const locks = window.navigator.locks;
    if (!storage || !locks || typeof locks.request !== 'function') return null;
    return {storage, locks};
  } catch {
    return null;
  }
}
const todayUtc = () => new Date().toISOString().slice(0,10);
const isUtcDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value;
};
function load(storage: AttemptStorage, utcDay: string): Ledger {
  const start: Ledger = {version: 1, utcDay, attempts: 0};
  const raw = storage.getItem(CLOUD_ATTEMPT_KEY);
  if (raw === null) return start;
  if (raw.length > 128) throw new Error('invalid ledger length');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('invalid ledger');
  const x = value as Partial<Ledger>;
  if (Object.keys(value).length !== 3 || x.version !== 1 || !isUtcDay(x.utcDay) ||
      x.utcDay > utcDay || typeof x.attempts !== 'number' || !Number.isSafeInteger(x.attempts) ||
      x.attempts < 0 || x.attempts > DAILY_CLOUD_ATTEMPT_LIMIT) {
    throw new Error('invalid ledger');
  }
  return x.utcDay < utcDay ? start : {version: 1, utcDay, attempts:x.attempts};
}
// Display/report only; the actual admission below always re-reads under the exclusive lock.
export function readCloudAttemptStatus(): CloudAttemptStatus {
  const utcDay=todayUtc();
  const limit=DAILY_CLOUD_ATTEMPT_LIMIT;
  try {
    const budget=getBudget();
    if (budget) {
      const {attempts}=load(budget.storage,utcDay);
      return {state:attempts>=limit?'spent':'available',attempts,limit,utcDay};
    }
  } catch { /* Can't prove eligibility; cloud stays closed. */ }
  return {state:'unavailable',attempts:null,limit,utcDay};
}
export async function reserveCloudAttempt(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const budget=getBudget();
  if (!budget) throw new Error('REQ211_DAILY_BUDGET_UNAVAILABLE');
  let outcome:'reserved'|'spent';
  try {
    outcome=await budget.locks.request(LOCK_NAME,{mode:'exclusive',signal},()=>{
      signal?.throwIfAborted();
      // Read the UTC date after lock acquisition. No provider calls inside this callback.
      const current=load(budget.storage,todayUtc());
      if(current.attempts>=DAILY_CLOUD_ATTEMPT_LIMIT) return 'spent' as const;
      const next=JSON.stringify({...current,attempts:current.attempts+1});
      budget.storage.setItem(CLOUD_ATTEMPT_KEY,next);
      if(budget.storage.getItem(CLOUD_ATTEMPT_KEY)!==next) throw new Error('daily ledger not durable');
      return 'reserved' as const;
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error('REQ211_DAILY_BUDGET_UNAVAILABLE');
  }
  if(outcome==='spent')throw new Error('REQ211_DAILY_ATTEMPTS_EXHAUSTED');
}
