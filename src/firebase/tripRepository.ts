import { doc, getDoc, setDoc } from 'firebase/firestore';
import { cloneTrip, PRESET_TRIPS } from '../domain/presets';
import type { Trip } from '../domain/trip';
import type { FirebaseRuntimeHandle } from './init';

const LOCAL_TRIPS_KEY = 'lvsyn_hybrid_trips_v1';

export function loadLocalTrips(): Trip[] {
  if (typeof localStorage === 'undefined') {
    return PRESET_TRIPS.map(cloneTrip);
  }
  try {
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

export function saveLocalTrips(trips: Trip[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
}

export async function syncTripToFirestoreIfEnabled(
  handle: FirebaseRuntimeHandle | null,
  trip: Trip
): Promise<'local_only' | 'firestore_synced' | 'firestore_offline_queued'> {
  if (!handle?.firestore || !handle.setup.isLiveProject) {
    return 'local_only';
  }
  const uid = handle.auth?.currentUser?.uid || 'guest-demo';
  const ref = doc(handle.firestore, 'users', uid, 'trips', trip.id);
  try {
    await setDoc(
      ref,
      {
        id: trip.id,
        title: trip.title,
        city: trip.city,
        dayOfWeek: trip.dayOfWeek,
        startTimeMin: trip.startTimeMin,
        returnDeadlineMin: trip.returnDeadlineMin,
        stops: trip.stops,
        updatedAt: trip.updatedAt,
      },
      { merge: true }
    );
    return typeof navigator !== 'undefined' && !navigator.onLine
      ? 'firestore_offline_queued'
      : 'firestore_synced';
  } catch {
    return 'local_only';
  }
}

export async function fetchTripFromFirestoreIfEnabled(
  handle: FirebaseRuntimeHandle | null,
  tripId: string
): Promise<Partial<Trip> | null> {
  if (!handle?.firestore || !handle.setup.isLiveProject) return null;
  const uid = handle.auth?.currentUser?.uid || 'guest-demo';
  try {
    const snap = await getDoc(doc(handle.firestore, 'users', uid, 'trips', tripId));
    return snap.exists() ? (snap.data() as Partial<Trip>) : null;
  } catch {
    return null;
  }
}
