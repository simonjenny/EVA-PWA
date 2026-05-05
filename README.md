# ÖV – Öffentlicher Nahverkehr

Eine Progressive Web App (PWA) für Echtzeit-Abfahrtszeiten und Reiseplanung des öffentlichen Nahverkehrs in der Region Basel/Baden-Württemberg. Nutzer können Haltestellen konfigurieren, sehen auf einen Blick die nächsten Abfahrten mit Live-Countdown (gefiltert nach Linie und Richtung) und können Verbindungen planen.

Live-Instanz: https://ov.b65.ch

---

## Inhaltsverzeichnis

- [Features](#features)
- [Technologie-Stack](#technologie-stack)
- [Projektstruktur](#projektstruktur)
- [Routen](#routen)
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

- **Echtzeit-Abfahrtszeiten** via EFA Baden-Württemberg API (`useRealtime=1`)
- **Live-Countdown** pro Abfahrt – aktualisiert sich lokal alle 15 Sekunden, Farbe ändert sich je nach Dringlichkeit (blau → orange → rot → „Jetzt")
- **GPS-Sortierung** – Haltestellen werden automatisch nach Distanz zum aktuellen Standort sortiert, mit Entfernungsanzeige
- **Haltestellensuche** mit Autocomplete (Debouncing, min. 2 Zeichen), gefiltert auf die Schweiz
- **Linien- & Richtungsfilter** pro Haltestelle – granulare Kontrolle welche Abfahrten angezeigt werden
- **Reiseplaner** – Verbindungen planen mit Abfahrts-/Ankunftszeit, Stationshistory und „Nach Hause"-Direktsuche via GPS
- **Reisedetails** – vollständige Leg-Timeline mit Zwischenstationen, Störungsmeldungen und Teilen-Funktion
- **QR-Export/Import** – Konfiguration als QR-Code exportieren und auf einem anderen Gerät importieren
- **Konfigurierbares Refresh-Intervall** (15 s / 30 s / 1 min / 2 min)
- **Heimhaltestelle** – konfigurierbare Standardstation für die „Nach Hause"-Funktion im Reiseplaner
- **Dark Mode** mit iOS-nativem Design
- **PWA** – installierbar auf iOS/Android/Desktop, mit `prompt`-basiertem Update-Banner
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
| QR-Code (Generierung) | qrcode | ^1.5 |
| PostCSS | autoprefixer | ^10 |

---

## Projektstruktur

```
/
├── src/
│   ├── main.js                  # App-Einstiegspunkt, Vue + Pinia + Router
│   ├── App.vue                  # Root-Komponente, Dark-Mode, QR-Import-Handler
│   ├── assets/
│   │   └── main.css             # Globales CSS (Tailwind-Direktiven)
│   ├── router/
│   │   └── index.js             # Vue Router (HTML5-History, 4 Routen)
│   ├── views/
│   │   ├── HomeView.vue         # Abfahrts-Übersicht mit GPS-Sortierung
│   │   ├── TripPlannerView.vue  # Reiseplaner – Verbindungssuche
│   │   ├── TripDetailView.vue   # Reisedetails – Leg-Timeline, Störungen, Teilen
│   │   └── SettingsView.vue     # Einstellungen – Dark Mode, Haltestellen, QR, Import
│   ├── components/
│   │   ├── BottomNav.vue        # Fixe Tab-Leiste (3 Tabs)
│   │   ├── StopCard.vue         # Haltestellen-Karte mit gruppierten Abfahrten
│   │   ├── NearbyStopCard.vue   # Automatisch erkannte Haltestelle in der Nähe
│   │   └── UpdatePrompt.vue     # PWA Service-Worker-Update-Banner
│   ├── services/
│   │   └── efa.js               # EFA API-Client (alle Abfragen, pure functions)
│   ├── stores/
│   │   └── settings.js          # Pinia Store (Haltestellen, Dark Mode, Intervall, etc.)
│   └── utils/
│       └── lineColors.js        # Farbzuordnung für Linien-Badges
├── public/                      # Statische Assets (PWA-Icons, favicon)
├── index.html                   # HTML-Shell (Viewport, Meta-Tags, Manifest-Link)
├── manifest.webmanifest         # Web App Manifest (dev-time; überschrieben beim Build)
├── vite.config.js               # Vite + PWA-Plugin Konfiguration
├── tailwind.config.js           # Tailwind + iOS-Theme
├── postcss.config.js
├── pwa-assets.config.js         # PWA-Icon-Generator Konfiguration
└── package.json
```

---

## Routen

| Pfad | View | Titel |
|---|---|---|
| `/` | HomeView | Abfahrten |
| `/trip` | TripPlannerView | Reiseplaner |
| `/trip/detail` | TripDetailView | Reisedetails |
| `/settings` | SettingsView | Einstellungen |

`HomeView` wird via `<keep-alive>` gecacht; die anderen Views werden beim Verlassen verworfen. Scroll-Wiederherstellung ist deaktiviert (`scrollRestoration: 'manual'`).

---

## Komponenten & Views

### `App.vue`
Root-Shell. Beobachtet `store.darkMode` und setzt/entfernt `.dark` auf `<html>`. Verarbeitet beim Mount den `?import=BASE64`-URL-Parameter für den QR-Import.

---

### `HomeView.vue`
Hauptansicht – zeigt alle konfigurierten Haltestellen als `StopCard`-Liste.

- Startet einen GPS-Watcher (`navigator.geolocation.watchPosition`) und sortiert Haltestellen nach Haversine-Distanz
- Erkennt automatisch die nächstgelegene nicht-konfigurierte Haltestelle und zeigt sie als `NearbyStopCard` an
- Löst fehlende Koordinaten via `resolveStopCoords()` auf
- Lädt Abfahrten beim Mount und per `setInterval` (Intervall aus Store)
- Zeigt Leer-Zustand mit Link zu Einstellungen wenn keine Haltestellen konfiguriert sind

**Lokale Datenhaltung pro Stop:**
```js
stopData[stopId] = {
  departures: [],   // gefilterte Abfahrten (max. 6)
  fetchedAt: Date,  // Zeitstempel des letzten API-Calls
  loading: bool,
  error: string|null
}
```

---

### `TripPlannerView.vue`
Reiseplaner mit Von/Nach-Suche, Datum/Uhrzeit, Abfahrt/Ankunft-Toggle.

- **Stationshistory** – zeigt zuletzt verwendete Stationen im Dropdown bei Fokus
- **Nach Hause** – GPS-Button: ermittelt nächste Haltestelle und füllt das Formular direkt
- **Zustandspersistenz** – Formular und Ergebnisse bleiben in `sessionStorage` bei Navigation zur Detail-Ansicht erhalten und werden beim Zurück-Navigieren wiederhergestellt
- **Störungsindikator** – Warnzeichen auf Trip-Karten wenn eine Linie betroffen ist
- Vergangene Verbindungen werden automatisch herausgefiltert

---

### `TripDetailView.vue`
Leg-Timeline einer ausgewählten Verbindung.

- Empfängt Trip-Daten via `query.data` (Navigation) oder lädt neu via API bei direktem URL-Aufruf (Share-Link)
- Zeigt Abfahrt/Ankunft, Linienbadges, Richtung, Zwischenstationen (ausklappbar), Gleis/Steig
- **Störungsmeldungen** pro Leg – aufklappbare Detailkarten mit Titel und Text
- **Teilen-Button** – `navigator.share` oder Clipboard-Fallback; generiert kurze URL mit Minimal-Parametern

---

### `SettingsView.vue`
Einstellungsseite mit fünf Bereichen:

1. **Dark Mode** – iOS-Toggle-Switch
2. **Reiseplaner** – Heimhaltestelle setzen/entfernen (mit Autocomplete-Suche)
3. **Abfahrten** – Refresh-Intervall (Segmented Control) + Haltestellenverwaltung mit Linienfilter-Panel
4. **Daten** – QR-Code exportieren (zeigt Modal mit QR + URL kopieren) / Einstellungen importieren (Base64-Code oder URL)
5. **Update** – Force-Reload mit Service-Worker-Update

---

### `BottomNav.vue`
Fixe Tab-Leiste am unteren Bildschirmrand mit `safe-area-inset-bottom`.

| Tab | Route |
|---|---|
| Abfahrten | `/` |
| Reiseplaner | `/trip` |
| Einstellungen | `/settings` |

---

### `NearbyStopCard.vue`
Automatisch eingeblendete Karte für die nächstgelegene nicht-konfigurierte Haltestelle.

- Wird nur angezeigt wenn GPS verfügbar und die Haltestelle nicht bereits in `store.stops` enthalten
- Blauer hervorgehobener Header mit „In deiner Nähe"-Label und Standort-Icon
- Aufklappbar – lädt Abfahrten erst beim Expandieren
- Zeigt Entfernung, Linienbadges, Richtung und Countdown-Pillen

---

### `StopCard.vue`
Karte für eine einzelne Haltestelle.

| Zustand | Anzeige |
|---|---|
| `loading: true` (leer) | 2 Skeleton-Loader-Zeilen (`animate-pulse`) |
| `error` | Rote Fehlermeldung |
| Keine Abfahrten | „Keine passenden Abfahrten gefunden" |
| Normal | Gruppierte Abfahrten: pro Linie max. 2, ähnliche Richtungen zusammengefasst |

Zeigt Entfernung in Metern/km wenn GPS verfügbar. Lokaler 15-Sekunden-Tick hält Countdowns aktuell.

**Countdown-Farben:**

| Restzeit | Farbe |
|---|---|
| ≤ 0 min | „Jetzt" (grau) |
| ≤ 1 min | Rot |
| ≤ 4 min | Orange |
| > 4 min | Blau (`ios-blue`) |

---

### `UpdatePrompt.vue`
Slide-in-Banner oben wenn ein neuer Service Worker wartet (`registerType: 'prompt'`). Nutzt `useRegisterSW` aus `virtual:pwa-register/vue`.

---

## Services

### `src/services/efa.js`

Alle EFA-API-Calls als pure async-Funktionen. Keine eigene State-Haltung.

**Base URL:** `https://www.efa-bw.de/bvb3`

> **Wichtig:** EFA gibt bei 1 Ergebnis ein Objekt zurück (kein Array). Immer `ensureArray()` verwenden.
> **Koordinaten:** EFA liefert `"lon,lat"` (lon zuerst).

| Funktion | Endpoint | Beschreibung |
|---|---|---|
| `searchStops(query)` | `XSLT_STOPFINDER_REQUEST` | Haltestellensuche, gefiltert auf Schweizer Bounding-Box |
| `getDepartures(stopId)` | `XML_DM_REQUEST` | Echtzeit-Abfahrten (40 Einträge) |
| `getAvailableLines(stopId)` | `XML_DM_REQUEST` | Alle Linien/Richtungen für eine Haltestelle (dedupliziert, sortiert) |
| `resolveStopCoords(stopId)` | `XML_DM_REQUEST` | Koordinaten für bekannte Stop-ID auflösen |
| `findNearestStop(lat, lon)` | `XML_COORD_REQUEST` | Nächste Haltestelle zu GPS-Koordinaten (Radius 1 km) |
| `planTrip(originId, destId, dateTime, depArr)` | `XSLT_TRIP_REQUEST2` | Verbindungen planen |
| `getCountdownMinutes(departure, fetchedAt)` | – | Verbleibende Minuten berechnen (korrigiert um verstrichene Zeit) |
| `filterDepartures(departures, filters)` | – | Abfahrten nach Linie/Richtung filtern (partial match, case-insensitive) |

---

## State Management

### `src/stores/settings.js` (Pinia)

Persistenter Store – alle Änderungen werden sofort per `watch` in `localStorage` geschrieben.

#### State

| Eigenschaft | Typ | Default | localStorage-Key |
|---|---|---|---|
| `stops` | `Stop[]` | `[]` | `abfahrten-v1` |
| `darkMode` | `boolean` | `false` | `abfahrten-darkmode-v1` |
| `refreshInterval` | `number` (Sekunden) | `30` | `abfahrten-refresh-v1` |
| `homeStop` | `Stop\|null` | `null` | `abfahrten-homestop-v1` |
| `stationHistory` | `Stop[]` | `[]` | `trip-station-history-v1` |

#### Stop-Datenstruktur

```js
{
  id: string,        // interne UUID (crypto.randomUUID())
  stopId: string,    // EFA-Stop-ID (ref.id aus API)
  stopName: string,  // Anzeigename
  lat: number|null,
  lon: number|null,
  filters: [
    { id: string, line: string, direction: string }
  ]
}
```

> `stop.id` ist die interne Pinia-UUID. `stop.stopId` ist die EFA-API-ID. `addFilter()` nimmt die interne `id`, nicht die `stopId`.

#### Actions

| Action | Beschreibung |
|---|---|
| `addStop(stopId, stopName, lat, lon)` | Haltestelle hinzufügen (Duplikat-Check via `stopId`) |
| `removeStop(id)` | Haltestelle entfernen (via interner `id`) |
| `addFilter(stopId, line, direction)` | Linienfilter hinzufügen |
| `removeFilter(stopId, filterId)` | Filter entfernen |
| `toggleDarkMode()` | Dark Mode umschalten |
| `setHomeStop(stop)` | Heimhaltestelle setzen oder `null` zum Löschen |
| `addToStationHistory(stop)` | Vorne einfügen, deduplizieren, max. 3 Einträge |
| `setStopCoords(stopId, lat, lon)` | Koordinaten für Stop via EFA-`stopId` setzen |
| `clearAll()` | Alle Haltestellen entfernen |

---

## Utilities

### `src/utils/lineColors.js`

#### `getLineStyle(servingLine): { bg: string, text: string }`

Gibt Badge-Farben zurück. Priorität:

1. **BVB/BLT-Liniennummern** (1–21 Tram, 30–50 Bus) – exakte Übereinstimmung
2. **Linienpräfix (Regex)**: `S\d` → S-Bahn grün, `U\d` → U-Bahn blau, `STR`/`T\d` → Tram rot
3. **motType-Mapping** (Fallback):

| motType | Verkehrsmittel | Farbe |
|---|---|---|
| 0 | S-Bahn | `#00963A` |
| 1 | U-Bahn | `#1C5FAD` |
| 2 | Schnellbahn | `#E30613` |
| 4 | Tram | `#D4511A` |
| 5 / 6 | Bus | `#808080` |
| 7 | Fernbus | `#7C4DFF` |
| 9 | Fähre | `#00ACC1` |
| 13 | Fernverkehr (ICE/IC/EC) | `#DB0A5B` |
| 15 | Bergbahn | `#00897B` |
| 16 | Fernzug | `#E53935` |

4. **Fallback**: Indigo `#6366F1`

---

## PWA & Offline-Support

- **`registerType: 'prompt'`** – SW-Updates werden dem Nutzer als Banner angezeigt (`UpdatePrompt.vue`). Kein Auto-Update.
- **Precache**: alle `.js`, `.css`, `.html`, `.ico`, `.png`, `.svg`, `.woff2`
- **Runtime-Cache EFA-API**: `NetworkFirst`, TTL 60 s, max. 20 Einträge (`efa-api-cache`)
- **Dev**: `devOptions.enabled: false` – Service Worker läuft im Dev-Server nicht

### Web App Manifest

| Eigenschaft | Wert |
|---|---|
| `name` / `short_name` | `ÖV` |
| `display` | `standalone` |
| `orientation` | `portrait` |
| `theme_color` | `#007AFF` |
| `background_color` | `#F2F2F7` |

---

## Installation & Entwicklung

### Voraussetzungen

- Node.js ≥ 18
- npm

### Setup

```bash
git clone <repo-url>
cd <repo>
npm install
```

### Entwicklungsserver

```bash
npm run dev          # Standard (alle Interfaces, HMR)
npm run dev:ios      # Öffnet gleichzeitig iOS Simulator
```

### PWA-Icons generieren

```bash
npm run generate-icons   # Aus public/icon.svg → alle Icon-Größen
```

---

## Build & Deployment

```bash
npm run build    # Produktions-Build → dist/
npm run preview  # Vorschau des Builds lokal
```

---

## Externe API

**Base URL:** `https://www.efa-bw.de/bvb3`

Alle Requests sind `GET` mit `URLSearchParams`. `outputFormat=JSON`. Keine Authentifizierung erforderlich.

| Endpoint | Zweck |
|---|---|
| `XSLT_STOPFINDER_REQUEST` | Haltestellensuche |
| `XML_DM_REQUEST` | Abfahrten / Linien / Koordinaten-Auflösung |
| `XML_COORD_REQUEST` | Nächste Haltestelle zu Koordinaten |
| `XSLT_TRIP_REQUEST2` | Verbindungsplanung |

> Die EFA-API ist ein öffentlicher Dienst des NVBW (Nahverkehrsgesellschaft Baden-Württemberg).

---

## Konfiguration

### Tailwind (`tailwind.config.js`)

| Token | Farbe | Verwendung |
|---|---|---|
| `ios-blue` | `#0A84FF` | Aktive Elemente, Countdown > 4 min |
| `ios-gray` | `#F2F2F7` | Hintergrund Light Mode |
| `ios-dark` | `#1C1C1E` | Text Dark Mode |
| `ios-secondary` | `#8E8E93` | Sekundärtext, inaktive Icons |
| `ios-separator` | `#C6C6C8` | Trennlinien |
| `ios-dark-bg` | `#121214` | Hintergrund Dark Mode |
| `ios-dark-card` | `#242426` | Karten Dark Mode |
| `ios-dark-elevated` | `#2F2F33` | Erhöhte Flächen Dark Mode |
| `ios-dark-separator` | `#3C3C3F` | Trennlinien Dark Mode |

Animation: `spin-reverse` (Gegenuhrzeigersinn-Rotation für Lade-Icon).

### Dark Mode

`darkMode: 'class'` – `.dark`-Klasse auf `<html>`, gesetzt durch `App.vue` basierend auf `store.darkMode`.

---

## Bekannte Eigenheiten

1. **EFA Single-Result-Wrapping** – 1 Treffer = Objekt, kein Array. Immer `ensureArray()` verwenden.
2. **Koordinaten-Reihenfolge** – EFA liefert `"lon,lat"`, nicht `"lat,lon"`. Beim Destructuring aufpassen.
3. **`stopId` vs. interne `id`** – `stop.stopId` ist die EFA-API-ID, `stop.id` ist die interne Pinia-UUID. `addFilter()` nimmt die interne `id`.
4. **PWA-Icons** – nach Änderung an `public/icon.svg` mit `npm run generate-icons` neu generieren.
5. **`registerSW.js` / `sw.js` im Root** – diese Dateien werden beim Build generiert und sind in `.gitignore` erfasst; nicht einchecken.
