## Project

EfaPWA / Abfahrten — Vue 3 PWA for real-time public transit departures (Basel/Baden-Württemberg). Live: https://ov.b65.ch

## Tech Stack

- Vue 3.4, `<script setup>`, JavaScript (no TypeScript)
- Pinia 2.1, Vue Router 4.3, Vite 5.2
- Tailwind CSS 3.4 (iOS design tokens), vite-plugin-pwa + Workbox
- External API: `https://www.efa-bw.de/bvb3` (EFA, no auth)

## Code Style

- Always use `<script setup>` in Vue components
- Plain JavaScript — never introduce TypeScript
- Tailwind utility classes only — avoid writing custom CSS
- iOS design tokens: `ios-blue`, `ios-gray`, `ios-dark`, `ios-secondary`, `ios-separator`
- Dark mode via Tailwind `dark:` prefix (class-based strategy)
- All UI strings in German
- `async/await` everywhere — no `.then()` chains
- `try/catch` in all `fetch`/API calls
- Local `ref()` for component-level loading and error states

## Key Patterns

### EFA API (src/services/efa.js)
- Always wrap API results in `ensureArray()` — EFA returns an object (not array) for single results
- Coordinates come as `"lon,lat"` strings — destructure as `const [lonStr, latStr] = coord.split(',')`
- All API functions are pure (no side effects, no store access)

### Pinia Store (src/stores/settings.js)
- `stop.id` — internal UUID (used for `removeStop`, `addFilter`, `removeFilter`)
- `stop.stopId` — EFA API stop ID (used for API calls and `setStopCoords`)
- Do not confuse these two IDs

### Components
- Loading states: use skeleton placeholders (animated `bg-gray-200 dark:bg-gray-700` divs)
- Errors: show inline in component, never use `alert()`
- Do not use `<style>` blocks unless absolutely unavoidable

## Project Structure

```
src/
├── services/efa.js          # All EFA API calls (pure functions)
├── stores/settings.js       # Pinia store (stops, darkMode, etc.)
├── utils/lineColors.js      # Line badge colors
├── views/
│   ├── HomeView.vue         # Departure board
│   ├── TripPlannerView.vue  # Journey planner
│   ├── TripDetailView.vue   # Trip detail
│   └── SettingsView.vue     # Settings
└── components/
    ├── StopCard.vue         # Single stop with departures
    ├── BottomNav.vue        # Bottom tab bar
    └── UpdatePrompt.vue     # PWA update prompt
```
