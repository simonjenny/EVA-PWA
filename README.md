# Abfahrten – ÖPNV Abfahrtsmonitor

Eine Progressive Web App (PWA) für Echtzeit-Abfahrtszeiten des öffentlichen Nahverkehrs in Basel. Nutzer können Haltestellen konfigurieren und sehen auf einen Blick die nächsten Abfahrten mit Live-Countdown, gefiltert nach Linie und Richtung.

---

## Inhaltsverzeichnis

Beispielinstallation : https://ov.b65.ch

---

## Inhaltsverzeichnis

- [Features](#features)
- [Technologie-Stack](#technologie-stack)
- [Projektstruktur](#projektstruktur)
- [Architektur & Datenfluss](#architektur--datenfluss)
- [Komponenten & Views](#komponenten--views)
- [Services](#services)
- [State Management](#state-management)
- [Utilities](#utilities)
- [PWA & Offline-Support](#pwa--offline-support)
- [Installation & Entwicklung](#installation--entwicklung)
- [Build & Deployment](#build--deployment)
- [Externe API](#externe-api)
- [Konfiguration](#konfiguration)

---

## Features

- **Echtzeit-Abfahrtszeiten** via EFA Baden-Württemberg API mit Echtzeit-Daten (`useRealtime=1`)
- **Live-Countdown** pro Abfahrt – aktualisiert sich lokal alle 15 Sekunden, Farbe ändert sich je nach Dringlichkeit (blau → orange → rot → „Jetzt")
- **Haltestellensuche** mit Autocomplete (Debouncing, min. 2 Zeichen)
- **Linien- & Richtungsfilter** pro Haltestelle – granulare Kontrolle welche Abfahrten angezeigt werden
- **Konfigurierbares Refresh-Intervall** (15 s / 30 s / 1 min / 2 min)
- **Dark Mode** mit iOS-nativem Design
- **PWA** – installierbar auf iOS/Android/Desktop, funktioniert offline mit gecachten Daten
- **Automatische SW-Updates** mit manuellem Aktualisierungs-Button in den Einstellungen
- **Responsives iOS-Design** mit systemnativer Schriftart, Safe-Area-Unterstützung und iOS-Farbpalette

---

## Technologie-Stack

| Kategorie | Paket | Version |
|---|---|---|
| Framework | Vue.js | ^3.4 |
| State Management | Pinia | ^2.1 |
| Routing | Vue Router | ^4.3 |
| Build-Tool | Vite | ^5.2 |
| PWA | vite-plugin-pwa | ^0.20 |
| CSS | Tailwind CSS | ^3.4 |
| PostCSS | autoprefixer | ^10 |

---

## Projektstruktur

```
/
├── src/
│   ├── main.js                  # App-Einstiegspunkt, Vue + Pinia + Router
│   ├── App.vue                  # Root-Komponente, Dark-Mode-Logik, Shell
│   ├── assets/
│   │   └── main.css             # Globales CSS (Tailwind-Direktiven)
│   ├── router/
│   │   └── index.js             # Vue Router (HTML5-History, 2 Routen)
│   ├── views/
│   │   ├── HomeView.vue         # Abfahrts-Übersicht, Auto-Refresh
│   │   └── SettingsView.vue     # Einstellungen, Haltestellenverwaltung
│   ├── components/
│   │   ├── BottomNav.vue        # Navigation am unteren Bildschirmrand
│   │   └── StopCard.vue         # Karte für eine Haltestelle mit Abfahrten
│   ├── services/
│   │   └── efa.js               # EFA API-Client (Suche, Abfahrten, Linien)
│   ├── stores/
│   │   └── settings.js          # Pinia Store (Haltestellen, Dark Mode, Intervall)
│   └── utils/
│       └── lineColors.js        # Farbzuordnung für Linien-Badges
├── public/                      # Statische Assets (PWA-Icons)
├── vite.config.js               # Vite + PWA-Plugin Konfiguration
├── tailwind.config.js           # Tailwind + iOS-Theme
├── postcss.config.js
├── pwa-assets.config.js         # PWA-Icon-Generator Konfiguration
├── manifest.webmanifest         # Web App Manifest
├── package.json
└── .env                         # Deploy-Ziel (nicht eingecheckt)
```

---

## Architektur & Datenfluss

```
Nutzer
  │
  ▼
HomeView
  │
  ├─ beim Mount & per setInterval (konfigurierbar)
  │    │
  │    ▼
  │  efa.js → getDepartures(stopId)
  │               └─ GET https://www.efa-bw.de/bvb3/XML_DM_REQUEST
  │                    └─ JSON → departureList[]
  │
  ├─ filterDepartures(departures, filters)
  │    └─ Linie + Richtung (partial match, case-insensitive)
  │
  └─ StopCard (pro Haltestelle)
       ├─ Zeigt erste 2 gefilterte Abfahrten
       └─ Lokaler 15-Sekunden-Tick → reaktiver Countdown

SettingsView
  │
  ├─ Haltestellensuche → efa.js.searchStops(query)
  │    └─ GET /XSLT_STOPFINDER_REQUEST
  │
  ├─ Linienfilter-Panel → efa.js.getAvailableLines(stopId)
  │    └─ GET /XML_DM_REQUEST (useRealtime=0, limit=80)
  │
  └─ Alles schreibt in Pinia Store → localStorage
```

---

## Komponenten & Views

### `App.vue`
Root-Shell der Anwendung. Beobachtet `store.darkMode` und setzt/entfernt die Klasse `.dark` am `<html>`-Element (Tailwind `darkMode: 'class'`). Enthält `<router-view>` in einem `<main>`-Container mit iOS-Safe-Area-Padding sowie `<BottomNav>`.

---

### `HomeView.vue`
Hauptansicht – zeigt alle konfigurierten Haltestellen als `StopCard`-Komponenten.

**Verhalten:**
- Lädt beim Mounten sofort Abfahrten für alle gespeicherten Haltestellen
- Startet einen `setInterval` basierend auf `store.refreshInterval` (Standard: 30 Sekunden)
- Reagiert per `watch` auf Änderungen des Refresh-Intervalls (alten Timer stoppen, neuen starten)
- Zeigt leeren Zustand mit Link zu `/settings` an, wenn noch keine Haltestellen konfiguriert sind
- Refresh-Button mit animiertem Lade-Icon (`spin-reverse`)

**Lokale Datenhaltung pro Stop:**
```js
stopData[stopId] = {
  departures: [],   // gefilterte Abfahrten
  fetchedAt: Date,  // Zeitstempel des letzten API-Calls
  loading: bool,
  error: string|null
}
```

---

### `SettingsView.vue`
Einstellungsseite mit vier Bereichen:

1. **Dark Mode** – iOS-style Toggle-Switch
2. **Refresh-Intervall** – Segmented Control mit 4 Optionen (15 s / 30 s / 1 min / 2 min)
3. **Haltestellenverwaltung**
   - Suchfeld mit Debouncing (350 ms), Autocomplete-Dropdown (max. 8 Ergebnisse)
   - Liste konfigurierter Haltestellen mit Entfernen-Button
   - Aktive Filter als Badges (Linie + Richtung)
   - Aufklappbares Linienfilter-Panel pro Haltestelle
4. **Aktualisieren-Button** – Löst SW-Update aus + `window.location.reload()`

**Linienfilter-Panel:**
- Lädt alle verfügbaren Linien und Richtungen via `getAvailableLines()`
- Checkbox-Liste mit Linie + Richtung
- „Alle abwählen"-Button zum schnellen Zurücksetzen

---

### `StopCard.vue`
Karte für eine einzelne Haltestelle.

| Zustand | Anzeige |
|---|---|
| `loading: true` | 2 Skeleton-Loader-Zeilen (`animate-pulse`) |
| `error` | Rote Fehlermeldung |
| Keine Abfahrten | „Keine passenden Abfahrten gefunden" |
| Normal | Bis zu 2 Abfahrten mit Badge, Richtung, Countdown |

**Countdown-Farblogik:**

| Restzeit | Farbe |
|---|---|
| ≤ 0 min | „Jetzt" (grau) |
| ≤ 1 min | Rot |
| ≤ 4 min | Orange |
| > 4 min | Blau (`ios-blue`) |

Ein lokaler 15-Sekunden-Tick (`setInterval`) hält den Countdown zwischen API-Refreshes aktuell.

---

### `BottomNav.vue`
Fixe Tab-Leiste am unteren Bildschirmrand mit `safe-area-inset-bottom`-Padding.

| Tab | Icon | Route |
|---|---|---|
| Abfahrten | Uhr | `/` |
| Einstellungen | Zahnrad | `/settings` |

Aktiver Tab: `text-ios-blue`, inaktiv: `text-ios-secondary`.

---

## Services

### `src/services/efa.js`

API-Client für die EFA Baden-Württemberg Schnittstelle.  
**Base URL:** `https://www.efa-bw.de/bvb3`

#### `searchStops(query: string)`
Sucht Haltestellen per Freitext.
- Endpoint: `GET /XSLT_STOPFINDER_REQUEST`
- Parameter: `type_sf=any`, `anyObjFilter_sf=2`, `outputFormat=JSON`
- Filtert Ergebnisse auf `anyType === 'stop'`
- Gibt zurück: `Array<{ id, name, place }>`

#### `getDepartures(stopId: string)`
Lädt Echtzeit-Abfahrten für eine Haltestelle.
- Endpoint: `GET /XML_DM_REQUEST`
- Parameter: `useRealtime=1`, `limit=40`, `outputFormat=JSON`
- Gibt zurück: `departureList[]` (rohe EFA-Objekte)

#### `getAvailableLines(stopId: string)`
Lädt alle Linien und Richtungen an einer Haltestelle (für den Filterassistenten).
- Endpoint: `GET /XML_DM_REQUEST`
- Parameter: `useRealtime=0`, `limit=80`
- Dedupliziert und sortiert Ergebnisse alphanumerisch (Locale `de`)
- Gibt zurück: `Array<{ id, line, direction }>`

#### `getCountdownMinutes(departure, fetchedAt: Date): number`
Berechnet die verbleibenden Minuten bis zur Abfahrt.
- Liest `departure.countdown` (EFA-Feld) und zieht die verstrichene Zeit seit `fetchedAt` ab
- Fallback auf `realDateTime` bzw. `dateTime` wenn `countdown` fehlt

#### `filterDepartures(departures[], filters[]): departures[]`
Filtert Abfahrten anhand gespeicherter Linien-/Richtungsfilter.
- Partial-Match, case-insensitive
- Filter: `lineName.includes(filter.line)` UND `direction.includes(filter.direction)`

---

## State Management

### `src/stores/settings.js` (Pinia)

Persistenter Store, der alle Nutzerkonfigurationen im `localStorage` speichert.

#### State

| Eigenschaft | Typ | Default | localStorage-Key |
|---|---|---|---|
| `stops` | `Stop[]` | `[]` | `abfahrten-v1` |
| `darkMode` | `boolean` | `false` | `abfahrten-darkmode-v1` |
| `refreshInterval` | `number` (Sekunden) | `30` | `abfahrten-refresh-v1` |

#### Stop-Datenstruktur

```js
{
  id: string,           // interne UUID (crypto.randomUUID())
  stopId: string,       // EFA-Haltestellen-ID
  stopName: string,     // Anzeigename
  filters: [
    {
      id: string,       // UUID des Filters
      line: string,     // Linienname (z. B. "S1", "Bus 15")
      direction: string // Richtung (z. B. "Stuttgart Hbf")
    }
  ]
}
```

#### Actions

| Action | Beschreibung |
|---|---|
| `addStop(stop)` | Haltestelle hinzufügen |
| `removeStop(stopId)` | Haltestelle entfernen |
| `addFilter(stopId, filter)` | Linienfilter einer Haltestelle hinzufügen |
| `removeFilter(stopId, filterId)` | Filter entfernen |
| `toggleDarkMode()` | Dark Mode umschalten |

Alle drei Refs werden per `watch` sofort in `localStorage` geschrieben bei jeder Änderung.

---

## Utilities

### `src/utils/lineColors.js`

#### `getLineStyle(servingLine): { bg: string, text: string }`

Gibt Hintergrund- und Textfarbe für ein Linienbadge zurück.

**Priorisierung:**

1. **Linienpräfix (Regex)**

| Muster | Typ | Hintergrundfarbe |
|---|---|---|
| `/^S\d/i` | S-Bahn | `#00963A` |
| `/^U\d/i` | U-Bahn | `#1C5FAD` |
| `/^STR/i` oder `/^T\d/i` | Tram | `#E5001A` |

2. **`motType`-Mapping** (wenn kein Präfix greift)

| motType | Verkehrsmittel | Farbe |
|---|---|---|
| 0 | S-Bahn | `#00963A` |
| 1 | U-Bahn / Stadtbahn | `#1C5FAD` |
| 2 | Schnellbahn | `#E30613` |
| 4 | Tram / Stadtbahn | `#D4511A` |
| 5 | Stadtbus | `#005CA9` |
| 6 | Regionalbus | `#E07000` |
| 7 | Fernbus | `#7C4DFF` |
| 9 | Fähre | `#00ACC1` |
| 13 | Fernverkehr (ICE/IC/EC) | `#DB0A5B` |
| 15 | Bergbahn | `#00897B` |
| 16 | Fernzug | `#E53935` |

3. **Fallback**: Indigo `#6366F1`

---

## PWA & Offline-Support

Die App ist als vollständige Progressive Web App konfiguriert.

### Service Worker
- **Strategie**: `autoUpdate` – der SW aktualisiert sich automatisch im Hintergrund
- **Precache**: alle `.js`, `.css`, `.html`, `.ico`, `.png`, `.svg`, `.woff2` Dateien
- **Runtime-Cache für EFA-API**:
  - Pattern: `https://www.efa-bw.de/bvb3/.*`
  - Strategie: `NetworkFirst` (versucht Netzwerk, fällt auf Cache zurück)
  - Cache-TTL: 60 Sekunden, max. 20 Einträge (`efa-api-cache`)

### Web App Manifest
| Eigenschaft | Wert |
|---|---|
| `display` | `standalone` |
| `orientation` | `portrait` |
| `theme_color` | `#007AFF` |
| `background_color` | `#F2F2F7` |
| `start_url` | `/` |

### Icons
- 192×192 PNG
- 512×512 PNG
- 512×512 maskable PNG
- SVG (any)

Generiert via `@vite-pwa/assets-generator` aus einer Quell-SVG (`pwa-assets.config.js`).

### iOS-spezifisch
- `safe-area-inset-bottom` / `safe-area-inset-top` werden vollständig berücksichtigt
- Systemschriftart: `-apple-system`, `SF Pro Display/Text`, `Helvetica Neue`
- iOS-Farbpalette (`ios-blue`, `ios-gray`, `ios-dark`, etc.) über Tailwind-Theme

---

## Installation & Entwicklung

### Voraussetzungen
- Node.js ≥ 18
- npm

### Setup

```bash
# Repository klonen
git clone <repo-url>
cd <repo-url>

# Abhängigkeiten installieren
npm install
```

### Entwicklungsserver starten

```bash
# Standard (erreichbar im lokalen Netzwerk)
npm run dev
```

### PWA-Icons generieren

```bash
npm run generate-icons
```

Generiert alle PWA-Icon-Größen aus der Quell-SVG.

---

## Build & Deployment

### Produktions-Build

```bash
npm run build
```

Ausgabe in `dist/`.

### Vorschau des Builds

```bash
npm run preview
```

---

## Externe API

Die App nutzt ausschließlich die **EFA Baden-Württemberg** Schnittstelle.

**Base URL:** `https://www.efa-bw.de/bvb3`

| Endpoint | Verwendung | Parameter |
|---|---|---|
| `GET /XSLT_STOPFINDER_REQUEST` | Haltestellensuche | `type_sf=any`, `anyObjFilter_sf=2`, `outputFormat=JSON` |
| `GET /XML_DM_REQUEST` | Echtzeit-Abfahrten | `useRealtime=1`, `limit=40`, `outputFormat=JSON` |
| `GET /XML_DM_REQUEST` | Linienabfrage | `useRealtime=0`, `limit=80`, `outputFormat=JSON` |

Alle Anfragen sind `GET`-Requests mit `URLSearchParams`. Die API gibt JSON zurück.

> **Hinweis:** Die EFA-API ist ein öffentlicher Dienst des NVBW (Nahverkehrsgesellschaft Baden-Württemberg). Keine Authentifizierung erforderlich.

---

## Konfiguration

### Tailwind (`tailwind.config.js`)

Benutzerdefinierte iOS-Farbpalette:

| Token | Verwendung |
|---|---|
| `ios-blue` | Aktive Elemente, Countdown > 4 min |
| `ios-gray` | Hintergründe (Light Mode) |
| `ios-dark` | Hintergrund (Dark Mode) |
| `ios-secondary` | Inaktive Tab-Icons, Sekundärtext |
| `ios-separator` | Trennlinien |

Benutzerdefinierte Animation:

| Name | Beschreibung |
|---|---|
| `spin-reverse` | Gegenuhrzeigersinn-Rotation für Lade-Icon |

### Dark Mode

`darkMode: 'class'` – gesteuert via `.dark`-Klasse auf `<html>`, gesetzt durch `App.vue` basierend auf `store.darkMode`.
