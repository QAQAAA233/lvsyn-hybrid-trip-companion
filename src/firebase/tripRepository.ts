import { cloneTrip, PRESET_TRIPS } from '../domain/presets';
import type { Trip } from '../domain/trip';
import type { FirebaseRuntimeHandle } from './init';

const LOCAL_TRIPS_KEY = 'lvsyn_hybrid_trips_v1';
export type LocalTripSaveResult = 'saved' | 'volatile';

export function loadLocalTrips(): Trip[] {
  try {
    if (typeof localStorage === 'undefined') return PRESET_TRIPS.map(cloneTrip);
    const raw = localStorage.getItem(LOCAL_TRIPS_KEY);
    if (!raw) return PRESET_TRIPS.map(cloneTrip);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return PRESET_TRIPS.map(cloneTrip);
    }
    return parsed as Trip[];
  } catch {
    return PRESET_TRIPS.map(cloneTrip);
  }
}

export function saveLocalTrips(trips: Trip[]): LocalTripSaveResult {
  try {
    if (typeof localStorage === 'undefined') return 'volatile';
    const storage=localStorage;
    const bytes=JSON.stringify(trips);
    storage.setItem(LOCAL_TRIPS_KEY, bytes);
    return storage.getItem(LOCAL_TRIPS_KEY)===bytes ? 'saved' : 'volatile';
  } catch {
    // Browser may disallow the storage getter or fail/reject a write.
    // Keep the edited trip in the open tab; never infer that it survived to a new tab.
    return 'volatile';
  }
}

// Competition review policy: a Firebase AI handle is not consent to upload trip drafts.
// The Spark demo retains trip edits locally even if AI Logic is live or connectivity changes.
export async function syncTripToFirestoreIfEnabled(
  _handle: FirebaseRuntimeHandle | null,
  _trip: Trip
): Promise<'local_only' | 'firestore_synced' | 'firestore_offline_queued'> {
  return 'local_only';
}

export async function fetchTripFromFirestoreIfEnabled(
  _handle: FirebaseRuntimeHandle | null,
  _tripId: string
): Promise<Partial<Trip> | null> {
  return null;
}
