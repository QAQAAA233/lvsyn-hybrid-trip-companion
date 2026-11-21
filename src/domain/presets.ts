import type { Trip } from './trip';

export const PRESET_TRIPS: Trip[] = [
  {
    id: 'kyoto-family-tue',
    title: 'Kyoto Family Day (Senior Parents)',
    city: 'Kyoto, Japan',
    dateIso: '2026-12-08',
    dayOfWeek: 'Tue',
    startTimeMin: 540, // 09:00
    returnDeadlineMin: 1140, // 19:00
    returnDeadlineLabel: '19:00 Shinkansen to Tokyo',
    travelerProfile: {
      label: 'Parents (72 & 69) · Step-Free Preferred',
      hasSeniors: true,
      needsWheelchairAccess: true,
      prefersLowWalking: true,
      transitMode: 'rail',
    },
    privateNotes:
      'Dad takes blood-pressure medication at 13:00 with food; Mom has mild left-knee osteoarthritis (avoid steep stone stairs). Hotel room key PIN: 4829# (keep strictly local on device).',
    updatedAt: 1763740800000,
    stops: [
      {
        id: 'kyoto-stop-1',
        name: 'Kinkaku-ji Golden Pavilion',
        category: 'Heritage',
        durationMin: 90,
        transitFromPrevMin: 25,
        openMin: 540, // 09:00
        closeMin: 1020, // 17:00
        closedDays: [],
        indoor: false,
        wheelchairFriendly: true,
        walkingBurden: 'moderate',
        notes: 'Flat gravel loop near pond; benches near tea garden exit.',
      },
      {
        id: 'kyoto-stop-2',
        name: 'Kyoto National Museum',
        category: 'Museum',
        durationMin: 120,
        transitFromPrevMin: 35,
        openMin: 570, // 09:30
        closeMin: 1020, // 17:00
        closedDays: ['Tue'], // Intentionally closed on Tuesday!
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Usually closed on Tuesdays unless national holiday.',
      },
      {
        id: 'kyoto-stop-3',
        name: 'Kiyomizu-dera Steep Approach',
        category: 'Temple',
        durationMin: 120,
        transitFromPrevMin: 25,
        openMin: 360, // 06:00
        closeMin: 1080, // 18:00
        closedDays: [],
        indoor: false,
        wheelchairFriendly: false,
        walkingBurden: 'high',
        notes: 'Steep pedestrian slope on Matsubara-dori; heavy steps.',
      },
      {
        id: 'kyoto-stop-4',
        name: 'Nishiki Covered Market Tea & Sweets',
        category: 'Food & Rest',
        durationMin: 90,
        transitFromPrevMin: 25,
        openMin: 600, // 10:00
        closeMin: 1080, // 18:00
        closedDays: [],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Covered arcade; seated matcha house inside.',
      },
      {
        id: 'kyoto-stop-5',
        name: 'Gion Shirakawa Early Dinner',
        category: 'Dining',
        durationMin: 90,
        transitFromPrevMin: 20,
        openMin: 660, // 11:00
        closeMin: 1290, // 21:30
        closedDays: [],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Must leave in time for Kyoto Station Shinkansen platform.',
      },
    ],
  },
  {
    id: 'swiss-alpine-rail',
    title: 'Swiss Alpine Rail & Cable Car',
    city: 'Lauterbrunnen & Murren',
    dateIso: '2026-12-10',
    dayOfWeek: 'Thu',
    startTimeMin: 510, // 08:30
    returnDeadlineMin: 1110, // 18:30
    returnDeadlineLabel: '18:30 InterCity Express to Zurich',
    travelerProfile: {
      label: 'Solo Rail Traveler · Tunnel Dead-Zones',
      hasSeniors: false,
      needsWheelchairAccess: false,
      prefersLowWalking: false,
      transitMode: 'rail',
    },
    privateNotes:
      'Swiss Half-Fare Card ID stored offline; allergy to tree nuts (carry EpiPen in daypack). Cellular signal drops completely through valley tunnels.',
    updatedAt: 1763740800000,
    stops: [
      {
        id: 'swiss-stop-1',
        name: 'Lauterbrunnen Valley Floor Walk',
        category: 'Scenic Walk',
        durationMin: 110,
        transitFromPrevMin: 20,
        openMin: 0,
        closeMin: 1439,
        closedDays: [],
        indoor: false,
        wheelchairFriendly: true,
        walkingBurden: 'moderate',
        notes: 'Paved valley path past Staubbach Falls.',
      },
      {
        id: 'swiss-stop-2',
        name: 'Schilthorn Piz Gloria Cable Car',
        category: 'Alpine Peak',
        durationMin: 165,
        transitFromPrevMin: 40,
        openMin: 480, // 08:00
        closeMin: 990, // 16:30 last descent
        closedDays: [],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Last return cable car departs 16:30 sharp.',
      },
      {
        id: 'swiss-stop-3',
        name: 'Murren Cliffside Promenade',
        category: 'Village',
        durationMin: 120,
        transitFromPrevMin: 30,
        openMin: 540, // 09:00
        closeMin: 1080, // 18:00
        closedDays: ['Thu'], // Maintenance day simulation
        indoor: false,
        wheelchairFriendly: false,
        walkingBurden: 'high',
        notes: 'Check winter cable maintenance notices before boarding.',
      },
      {
        id: 'swiss-stop-4',
        name: 'Interlaken Ost Riverside Bakery',
        category: 'Cafe & Transfer',
        durationMin: 75,
        transitFromPrevMin: 45,
        openMin: 450, // 07:30
        closeMin: 1140, // 19:00
        closedDays: [],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Adjacent to Interlaken Ost platform 4.',
      },
    ],
  },
  {
    id: 'taipei-rainy-loop',
    title: 'Taipei Rainy-Day Accessible Loop',
    city: 'Taipei, Taiwan',
    dateIso: '2026-12-12',
    dayOfWeek: 'Sat',
    startTimeMin: 600, // 10:00
    returnDeadlineMin: 1200, // 20:00
    returnDeadlineLabel: '20:00 High-Speed Rail Return',
    travelerProfile: {
      label: 'Stroller + Grandparents · Indoor Priority',
      hasSeniors: true,
      needsWheelchairAccess: true,
      prefersLowWalking: true,
      transitMode: 'transit',
    },
    privateNotes:
      'Infant nap window 13:30-15:00; stroller width 68 cm; avoid uncovered walkways during heavy rain squalls.',
    updatedAt: 1763740800000,
    stops: [
      {
        id: 'taipei-stop-1',
        name: 'National Taiwan Museum & Land Bank Hall',
        category: 'Museum',
        durationMin: 105,
        transitFromPrevMin: 20,
        openMin: 570, // 09:30
        closeMin: 1020, // 17:00
        closedDays: ['Mon'],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Elevators at all galleries; nursing room on 1F.',
      },
      {
        id: 'taipei-stop-2',
        name: 'Daan Forest Park Open Loop',
        category: 'Outdoor Park',
        durationMin: 105,
        transitFromPrevMin: 25,
        openMin: 0,
        closeMin: 1439,
        closedDays: [],
        indoor: false,
        wheelchairFriendly: true,
        walkingBurden: 'high',
        notes: 'Exposed to rain; long perimeter walk without canopy.',
      },
      {
        id: 'taipei-stop-3',
        name: 'Huashan 1914 Covered Design Arcade',
        category: 'Culture & Coffee',
        durationMin: 120,
        transitFromPrevMin: 20,
        openMin: 600, // 10:00
        closeMin: 1260, // 21:00
        closedDays: [],
        indoor: true,
        wheelchairFriendly: true,
        walkingBurden: 'low',
        notes: 'Ground-level brick warehouses and stroller-friendly ramps.',
      },
      {
        id: 'taipei-stop-4',
        name: 'Ningxia Night Market Early Dinner',
        category: 'Night Market',
        durationMin: 110,
        transitFromPrevMin: 25,
        openMin: 1020, // 17:00
        closeMin: 1439,
        closedDays: [],
        indoor: false,
        wheelchairFriendly: false,
        walkingBurden: 'moderate',
        notes: 'Crowded lane after 18:00; covered stalls along east edge.',
      },
    ],
  },
];

export function cloneTrip(trip: Trip): Trip {
  return structuredClone(trip);
}
