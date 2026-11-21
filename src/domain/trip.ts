export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type WalkingBurden = 'low' | 'moderate' | 'high';

export type StopScheduleStatus = 'on_time' | 'tight' | 'closed' | 'past_deadline';

export interface TravelerProfile {
  label: string;
  hasSeniors: boolean;
  needsWheelchairAccess: boolean;
  prefersLowWalking: boolean;
  transitMode: 'rail' | 'transit' | 'car';
}

export interface TripStop {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  transitFromPrevMin: number;
  openMin: number;
  closeMin: number;
  closedDays: DayOfWeek[];
  indoor: boolean;
  wheelchairFriendly: boolean;
  walkingBurden: WalkingBurden;
  notes: string;
}

export interface Trip {
  id: string;
  title: string;
  city: string;
  dateIso: string;
  dayOfWeek: DayOfWeek;
  startTimeMin: number;
  returnDeadlineMin: number;
  returnDeadlineLabel: string;
  travelerProfile: TravelerProfile;
  privateNotes: string;
  stops: TripStop[];
  updatedAt: number;
}

export function formatMinutes(totalMin: number): string {
  const clamped = Math.max(0, Math.round(totalMin));
  const hours = Math.floor(clamped / 60) % 24;
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function parseTimeToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
