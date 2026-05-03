# CLAUDE.md — Agentic Development Instructions

This file provides context and instructions for AI agents (Claude, OpenCode, Copilot, Cursor, etc.) working on this codebase.

## Project Overview

**ÖV** is a Progressive Web App (PWA) for real-time public transit departure monitoring in the Basel/Baden-Württemberg region (Germany/Switzerland). Users configure transit stops, see live departure countdowns, and filter by line/direction. A trip planner (Reiseplaner) is also included.

Live instance: https://ov.b65.ch

---

## Commands

```bash
npm run dev          # Start Vite dev server (all interfaces, HMR enabled)
npm run dev:ios      # Start dev server with iOS-specific config (via ./dev script)
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
npm run generate-icons  # Regenerate PWA icons from icon.svg
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Vue 3.4 (Composition API, `<script setup>`) |
| Language | JavaScript (ES Modules — **no TypeScript**) |
| Build | Vite 5.2 |
| State | Pinia 2.1 (persisted to `localStorage`) |
| Routing | Vue Router 4.3 (`createWebHistory`) |
| CSS | Tailwind CSS 3.4 with custom iOS design tokens |
| PWA | vite-plugin-pwa 0.20 + Workbox (NetworkFirst for API) |
| External API | EFA Baden-Württemberg (`https://www.efa-bw.de/bvb3`) |
| QR | `jsqr` (scan), `qrcode` (generate) |

---

## Architecture

```
src/
├── main.js                  # App entry: Vue + Pinia + Router mount
├── App.vue                  # Root: dark mode class toggle, <router-view>, <BottomNav>
├── router/index.js          # 4 routes (see Routes section)
├── views/
│   ├── HomeView.vue         # Departure board — auto-refresh, StopCard list
│   ├── TripPlannerView.vue  # Journey planner — origin/destination search
│   ├── TripDetailView.vue   # Trip itinerary detail view
│   └── SettingsView.vue     # Settings — dark mode, refresh interval, stop management
├── components/
│   ├── BottomNav.vue        # Fixed bottom tab bar (3 tabs)
│   ├── StopCard.vue         # Single stop: skeleton loader, departures, countdown badges
│   └── UpdatePrompt.vue     # PWA service worker update prompt (registerType: 'prompt')
├── services/
│   └── efa.js               # All EFA API calls (pure functions, no state)
├── stores/
│   └── settings.js          # Pinia store: stops, darkMode, refreshInterval, homeStop, stationHistory
└── utils/
    └── lineColors.js        # Transit line badge colors by name/motType
```

### Routes

| Path | View | Title |
|---|---|---|
| `/` | HomeView | Abfahrten |
| `/trip` | TripPlannerView | Reiseplaner |
| `/trip/detail` | TripDetailView | Reisedetails |
| `/settings` | SettingsView | Einstellungen |

---

## EFA API

Base URL: `https://www.efa-bw.de/bvb3`

All calls use `outputFormat=JSON`. No authentication required.

| Endpoint | Function | Purpose |
|---|---|---|
| `XSLT_STOPFINDER_REQUEST` | `searchStops(query)` | Stop search by name |
| `XML_DM_REQUEST` | `getDepartures(stopId)` | Live departures (40 items, realtime) |
| `XML_DM_REQUEST` | `getAvailableLines(stopId)` | All lines/directions for a stop |
| `XML_DM_REQUEST` | `resolveStopCoords(stopId)` | Resolve coordinates for a known stopId |
| `XML_COORD_REQUEST` | `findNearestStop(lat, lon)` | Nearest stop to GPS coordinates |
| `XSLT_TRIP_REQUEST2` | `planTrip(originId, destId, dateTime, depArr)` | Plan a journey |

**Important:** EFA returns a single object (not array) when only 1 result is found. Always use the `ensureArray()` helper in `efa.js`.

**Stop ID format:** EFA uses numeric stop IDs (e.g. `8503000`). The `stopId` in the Pinia store corresponds to `ref.id` from stop search results.

**Coordinate format:** EFA returns coords as `"lon,lat"` strings (note: **lon first, then lat**).

**Switzerland filter:** `searchStops()` filters results to Swiss bounding box (lat 45.8–47.85, lon 5.95–10.5).

---

## Pinia Store (`src/stores/settings.js`)

### State

| Key | Type | Storage Key | Description |
|---|---|---|---|
| `stops` | `Stop[]` | `abfahrten-v1` | Configured departure stops |
| `darkMode` | `boolean` | `abfahrten-darkmode-v1` | Dark mode toggle |
| `refreshInterval` | `number` | `abfahrten-refresh-v1` | Auto-refresh in seconds (default: 30) |
| `homeStop` | `Stop \| null` | `abfahrten-homestop-v1` | Home stop for the trip planner |
| `stationHistory` | `Stop[]` | `trip-station-history-v1` | Recent trip planner stations (max 3) |

### Stop Object Shape

```js
{
  id: string,        // crypto.randomUUID() — internal unique ID
  stopId: string,    // EFA stop ID (ref.id from API)
  stopName: string,  // Display name
  lat: number|null,
  lon: number|null,
  filters: Filter[]  // Line/direction filters
}
```

### Filter Object Shape

```js
{
  id: string,        // crypto.randomUUID()
  line: string,      // e.g. "S3", "10", "" (empty = match all)
  direction: string  // e.g. "Basel SBB", "" (empty = match all)
}
```

### Actions

- `addStop(stopId, stopName, lat, lon)` — adds stop if not already present
- `removeStop(id)` — removes by internal `id`
- `addFilter(stopId, line, direction)` — adds filter to stop (uses internal stop `id`)
- `removeFilter(stopId, filterId)` — removes filter
- `toggleDarkMode()` — flips dark mode
- `setHomeStop(stop)` — sets home stop (or `null` to clear)
- `addToStationHistory(stop)` — prepends to history, deduplicates, max 3 entries
- `setStopCoords(stopId, lat, lon)` — updates coords for a stop (uses EFA `stopId`)
- `clearAll()` — removes all stops

---

## Code Conventions

- **Vue 3 Composition API only** — use `<script setup>` syntax in all components
- **No TypeScript** — plain JavaScript with JSDoc comments where helpful
- **Tailwind CSS** — no custom CSS classes unless truly necessary; use Tailwind utilities
- **iOS design language** — custom tokens: `ios-blue`, `ios-gray`, `ios-dark`, `ios-secondary`, `ios-separator`; dark mode via `dark:` prefix (class-based)
- **Dark mode** — controlled by `class` strategy; `App.vue` applies `dark` class to `<html>` based on store
- **No test framework** — there are no unit tests in this project
- **ES Modules** — `"type": "module"` in package.json; use `import/export` everywhere
- **Async/await** — always use `async/await` over `.then()` chains
- **Error handling** — use `try/catch` in service calls; UI components handle loading/error states locally with `ref()`
- **German UI language** — all user-facing strings are in German

---

## PWA / Service Worker

- `registerType: 'prompt'` — SW updates are NOT automatic; `UpdatePrompt.vue` shows a user-facing prompt
- Workbox precaches all static assets (`js, css, html, ico, png, svg, woff2`)
- EFA API is cached with `NetworkFirst`, TTL 60s, max 20 entries (`efa-api-cache`)
- PWA dev mode is **disabled** (`devOptions.enabled: false`) — SW does not run in dev

---

## Tailwind Custom Tokens

Defined in `tailwind.config.js`:

```
ios-blue       #007AFF   (primary action color)
ios-gray       #8E8E93   (secondary text)
ios-dark       #1C1C1E   (dark background)
ios-secondary  #F2F2F7   (light background)
ios-separator  #C6C6C8   (dividers/borders)
```

Custom animation: `spin-reverse` (reverse spin for loading indicators).

---

## Known Gotchas

1. **EFA single-result wrapping** — when the API returns 1 item, it's an object, not an array. Always use `ensureArray()`.
2. **Coordinate order** — EFA returns `"lon,lat"`, not `"lat,lon"`. Destructure carefully: `const [lonStr, latStr] = coord.split(',')`.
3. **stopId vs internal id** — `stop.stopId` is the EFA API ID; `stop.id` is the internal Pinia UUID. `addFilter()` takes the internal `id`, not the EFA `stopId`.
4. **PWA icons** — regenerate with `npm run generate-icons` after changing `icon.svg`. Source: `pwa-assets.config.js`.
5. **README is partially outdated** — the README documents 2 views and 2 routes, but there are now 4 routes including the trip planner.
