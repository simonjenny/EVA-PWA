<script setup>
import { ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings.js'
import { searchStops, getAvailableLines } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'
import QRCode from 'qrcode'

const store = useSettingsStore()

async function forceReload() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  }
  window.location.reload()
}

// ─── Heimhaltestelle Suche ───────────────────────────────
const homeQuery = ref(store.homeStop?.stopName || '')
const homeResults = ref([])
const homeSearching = ref(false)
let homeTimeout = null

watch(homeQuery, (val) => {
  clearTimeout(homeTimeout)
  homeResults.value = []
  if (val.trim().length < 2) return
  homeSearching.value = true
  homeTimeout = setTimeout(async () => {
    try {
      homeResults.value = await searchStops(val)
    } catch { /* silent */ } finally {
      homeSearching.value = false
    }
  }, 350)
})

function selectHomeStop(result) {
  store.setHomeStop({ stopId: result.id, stopName: result.name, lat: result.lat ?? null, lon: result.lon ?? null })
  homeQuery.value = result.name
  homeResults.value = []
}

function clearHomeStop() {
  store.setHomeStop(null)
  homeQuery.value = ''
  homeResults.value = []
}

// ─── Haltestellen-Suche (Abfahrten) ─────────────────────
const searchQuery = ref('')
const searchResults = ref([])
const searching = ref(false)
const searchError = ref(null)
const searchInputRef = ref(null)
const lastSelected = ref(null)
let searchTimeout = null

watch(searchQuery, (val) => {
  clearTimeout(searchTimeout)
  searchResults.value = []
  searchError.value = null
  if (val.trim().length < 2) return

  searching.value = true
  searchTimeout = setTimeout(async () => {
    try {
      searchResults.value = await searchStops(val)

    } catch {
      searchError.value = 'Suche fehlgeschlagen – bitte erneut versuchen'
    } finally {
      searching.value = false
    }
  }, 350)
})

function selectStop(result, event) {
  if (event?.type === 'touchend') {
    event.preventDefault()
  }
  if (lastSelected.value === result.id) return
  lastSelected.value = result.id
  setTimeout(() => {
    if (lastSelected.value === result.id) lastSelected.value = null
  }, 300)

  store.addStop(result.id, result.name, result.lat ?? null, result.lon ?? null)
  searchQuery.value = ''
  searchResults.value = []
  searchInputRef.value?.blur()
}

// ─── Verfügbare Linien pro Stop ─────────────────────────────
// availableLines: { [stopUuid]: { lines: [], loading: bool, error: string|null } }
const availableLines = ref({})

async function loadLinesForStop(stop) {
  if (availableLines.value[stop.id]) return   // bereits geladen
  availableLines.value[stop.id] = { lines: [], loading: true, error: null }
  try {
    const lines = await getAvailableLines(stop.stopId)
    availableLines.value[stop.id].lines = lines
  } catch {
    availableLines.value[stop.id].error = 'Linien konnten nicht geladen werden'
  } finally {
    availableLines.value[stop.id].loading = false
  }
}

// ─── Filter-Panel öffnen ─────────────────────────────────────
const openPanelFor = ref(null)

function togglePanel(stop) {
  if (openPanelFor.value === stop.id) {
    openPanelFor.value = null
  } else {
    openPanelFor.value = stop.id
    loadLinesForStop(stop)
  }
}

// ─── QR Export ──────────────────────────────────────────────
const showQrModal = ref(false)
const qrDataUrl = ref('')
const exportUrl = ref('')
const copyDone = ref(false)

async function openQrExport() {
  const compact = store.stops.map(stop => {
    const entry = { i: stop.stopId, n: stop.stopName }
    if (stop.lat != null) entry.la = stop.lat
    if (stop.lon != null) entry.lo = stop.lon
    if (stop.filters.length > 0) entry.f = stop.filters.map(f => [f.line, f.direction])
    return entry
  })
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(compact))))
  exportUrl.value = `${location.origin}/?import=${base64}`
  qrDataUrl.value = await QRCode.toDataURL(exportUrl.value, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000', light: '#fff' }
  })
  copyDone.value = false
  showQrModal.value = true
}

async function copyExportUrl() {
  try {
    await navigator.clipboard.writeText(exportUrl.value)
    copyDone.value = true
    setTimeout(() => { copyDone.value = false }, 2000)
  } catch { /* silent */ }
}

// ─── Import ──────────────────────────────────────────────────
const showImportModal = ref(false)
const importText = ref('')
const importError = ref('')

async function confirmImport() {
  importError.value = ''
  try {
    let code = importText.value.trim()
    if (code.includes('?import=')) {
      code = code.split('?import=')[1].split('&')[0]
    }
    const list = JSON.parse(decodeURIComponent(escape(atob(code))))
    if (!Array.isArray(list)) throw new Error()
    store.clearAll()
    localStorage.removeItem('abfahrten-v1')
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    for (const s of list) {
      const efaId = s.i ?? s.stopId
      const name = s.n ?? s.stopName
      store.addStop(efaId, name, s.la ?? null, s.lo ?? null)
      const added = store.stops.find(x => x.stopId === efaId)
      if (added) {
        for (const f of (s.f ?? s.filters ?? [])) {
          const line = Array.isArray(f) ? f[0] : f.line
          const dir = Array.isArray(f) ? f[1] : f.direction
          store.addFilter(added.id, line, dir)
        }
      }
    }
    location.replace('/')
  } catch {
    importError.value = 'Ungültiger Code – bitte nochmal versuchen.'
  }
}


function isSelected(stop, line, direction) {
  return stop.filters.some(f => f.line === line && f.direction === direction)
}

function toggleLine(stop, line, direction) {
  const existing = stop.filters.find(f => f.line === line && f.direction === direction)
  if (existing) {
    store.removeFilter(stop.id, existing.id)
  } else {
    store.addFilter(stop.id, line, direction)
  }
}
</script>

<template>
  <div class="px-4 pb-10" style="padding-top: calc(env(safe-area-inset-top, 0px) + 16px);">
    <div class="flex items-center justify-between gap-4 mb-6">
      <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight">Einstellungen</h1>
      <button
        @click="forceReload"
        class="text-ios-blue text-sm font-medium py-2 px-3 rounded-xl border border-ios-blue/10 transition hover:bg-ios-blue/5"
        type="button"
      >
        Aktualisieren
      </button>
    </div>

    <!-- ══ SEKTION: ALLGEMEIN ══ -->
    <p class="text-xs font-semibold text-ios-secondary uppercase tracking-wide px-1 mb-2">Allgemein</p>

    <!-- Dark Mode -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-3" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div class="flex items-center px-4 py-4">
        <span class="flex-1 text-sm font-medium text-ios-dark dark:text-white">Dark Mode</span>
        <button
          @click="store.toggleDarkMode()"
          class="relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0"
          :class="store.darkMode ? 'bg-ios-blue' : 'bg-gray-300 dark:bg-ios-dark-elevated'"
          role="switch"
          :aria-checked="store.darkMode"
        >
          <span
            class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200"
            :class="store.darkMode ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <!-- Aktualisierungsintervall -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-6" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div class="px-4 py-3 border-b border-gray-100 dark:border-ios-dark-separator">
        <p class="text-xs font-medium text-ios-secondary uppercase tracking-wide">Automatisch aktualisieren</p>
      </div>
      <div class="flex items-center px-4 divide-x divide-gray-100 dark:divide-ios-dark-separator">
        <button
          v-for="option in [15, 30, 60, 120]"
          :key="option"
          @click="store.refreshInterval = option"
          class="flex-1 py-3 text-sm font-medium transition-colors"
          :class="store.refreshInterval === option ? 'text-ios-blue' : 'text-ios-secondary'"
        >
          {{ option >= 60 ? `${option / 60} min` : `${option} s` }}
        </button>
      </div>
    </div>

    <!-- ══ SEKTION: REISEPLANER ══ -->
    <p class="text-xs font-semibold text-ios-secondary uppercase tracking-wide px-1 mb-2">Reiseplaner</p>

    <!-- Heimhaltestelle -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-6" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div class="px-4 py-3 border-b border-gray-100 dark:border-ios-dark-separator">
        <p class="text-xs font-medium text-ios-secondary uppercase tracking-wide">Heimhaltestelle</p>
      </div>

      <!-- Gesetzt: Anzeige + Löschen -->
      <div v-if="store.homeStop" class="flex items-center px-4 py-4 gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="text-ios-blue flex-shrink-0">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M9 21V12h6v9" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-ios-dark dark:text-white truncate">{{ store.homeStop.stopName }}</p>
          <p class="text-xs text-ios-secondary mt-0.5">Heimhaltestelle</p>
        </div>
        <button @click="clearHomeStop" class="text-red-500 text-sm font-medium flex-shrink-0 active:opacity-60">
          Entfernen
        </button>
      </div>

      <!-- Nicht gesetzt: Suchfeld -->
      <div v-else class="px-3 py-3">
        <div class="flex items-center gap-2 bg-ios-gray dark:bg-ios-dark-elevated rounded-xl px-3 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            v-model="homeQuery"
            placeholder="Heimhaltestelle suchen…"
            class="flex-1 bg-transparent text-ios-dark dark:text-white outline-none placeholder-ios-secondary"
            style="font-size: 16px;"
            autocomplete="off" autocorrect="off" spellcheck="false"
          />
          <button v-if="homeQuery" @click="homeQuery = ''" class="text-ios-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
            </svg>
          </button>
        </div>
        <div v-if="homeSearching" class="px-1 pt-3 pb-1 text-ios-secondary text-sm flex items-center gap-2">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Suche…
        </div>
        <div v-else-if="homeResults.length > 0" class="mt-1 border-t border-gray-100 dark:border-ios-dark-separator">
          <button
            v-for="result in homeResults.slice(0, 5)"
            :key="result.id"
            type="button"
            @click="selectHomeStop(result)"
            class="w-full flex items-center px-1 py-3 border-b border-gray-100 dark:border-ios-dark-separator last:border-0 active:bg-ios-gray dark:active:bg-ios-dark-elevated text-left"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ios-dark dark:text-white truncate">{{ result.name }}</p>
              <p v-if="result.place" class="text-xs text-ios-secondary truncate">{{ result.place }}</p>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- ══ SEKTION: ABFAHRTEN ══ -->
    <p class="text-xs font-semibold text-ios-secondary uppercase tracking-wide px-1 mb-2">Abfahrten</p>

    <!-- Suchfeld für Abfahrts-Haltestellen -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-4" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div class="px-4 py-3 border-b border-gray-100 dark:border-ios-dark-separator">
        <p class="text-xs font-medium text-ios-secondary uppercase tracking-wide">Haltestelle hinzufügen</p>
      </div>
      <div class="px-3 py-3">
        <div class="flex items-center gap-2 bg-ios-gray dark:bg-ios-dark-elevated rounded-xl px-3 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            placeholder="Haltestelle suchen…"
            class="flex-1 bg-transparent text-ios-dark dark:text-white outline-none placeholder-ios-secondary"
            style="font-size: 16px;"
            autocomplete="off" autocorrect="off" spellcheck="false"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-ios-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
            </svg>
          </button>
        </div>
      </div>
      <div v-if="searching" class="px-4 pb-4 text-ios-secondary text-sm flex items-center gap-2">
        <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Suche…
      </div>
      <div v-else-if="searchError" class="px-4 pb-4 text-sm text-red-500">{{ searchError }}</div>
      <div v-else-if="searchQuery.length >= 2 && !searching && searchResults.length === 0" class="px-4 pb-4 text-sm text-ios-secondary">
        Keine Haltestellen gefunden
      </div>
      <div v-if="searchResults.length > 0">
        <button
          v-for="result in searchResults.slice(0, 8)"
          :key="result.id"
          type="button"
          @click.prevent="selectStop(result, $event)"
          @touchend.prevent="selectStop(result, $event)"
          class="w-full flex items-center px-4 py-3 border-t border-gray-100 dark:border-ios-dark-separator active:bg-ios-gray dark:active:bg-ios-dark-elevated text-left"
          style="touch-action: manipulation;"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-ios-dark dark:text-white truncate">{{ result.name }}</p>
            <p v-if="result.place" class="text-xs text-ios-secondary truncate">{{ result.place }}</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Konfigurierte Haltestellen -->
    <div class="flex flex-col gap-4 mb-6">
      <div
        v-for="stop in store.stops"
        :key="stop.id"
        class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden"
        style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);"
      >
        <div class="flex items-center px-4 py-4">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-ios-dark dark:text-white text-sm truncate">{{ stop.stopName }}</p>
            <p class="text-xs text-ios-secondary mt-0.5">
              <template v-if="stop.filters.length === 0">Alle Linien</template>
              <template v-else>{{ stop.filters.length }} Linie{{ stop.filters.length !== 1 ? 'n' : '' }} ausgewählt</template>
            </p>
          </div>
          <button @click="store.removeStop(stop.id)" class="ml-3 text-red-500 text-sm font-medium flex-shrink-0 active:opacity-60">
            Entfernen
          </button>
        </div>
        <div v-if="stop.filters.length > 0 && openPanelFor !== stop.id" class="px-4 pb-3 flex flex-wrap gap-1.5">
          <span
            v-for="f in stop.filters"
            :key="f.id"
            class="inline-flex items-center gap-1 text-xs rounded-lg pl-1.5 pr-2 py-1"
            :style="{ backgroundColor: getLineStyle({ number: f.line }).bg + '20', color: getLineStyle({ number: f.line }).bg }"
          >
            <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-md" :style="{ backgroundColor: getLineStyle({ number: f.line }).bg, color: getLineStyle({ number: f.line }).text }">{{ f.line || '?' }}</span>
            <span class="truncate max-w-[120px]">{{ f.direction }}</span>
          </span>
        </div>
        <div class="border-t border-gray-100 dark:border-ios-dark-separator">
          <button @click="togglePanel(stop)" class="w-full flex items-center justify-between px-4 py-3 active:bg-ios-gray dark:active:bg-ios-dark-elevated">
            <span class="text-sm text-ios-blue font-medium">{{ openPanelFor === stop.id ? 'Auswahl schließen' : 'Linien auswählen' }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-ios-secondary transition-transform" :class="openPanelFor === stop.id ? 'rotate-180' : ''">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div v-if="openPanelFor === stop.id" class="border-t border-gray-100 dark:border-ios-dark-separator">
            <div v-if="availableLines[stop.id]?.loading" class="px-4 py-5 flex items-center gap-2 text-ios-secondary text-sm">
              <svg class="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Linien werden geladen…
            </div>
            <div v-else-if="availableLines[stop.id]?.error" class="px-4 py-4 text-sm text-red-500">{{ availableLines[stop.id].error }}</div>
            <div v-else-if="availableLines[stop.id]?.lines.length > 0">
              <div class="px-4 py-2.5 flex items-center justify-between border-b border-gray-50 dark:border-ios-dark-separator">
                <span class="text-xs text-ios-secondary">Ohne Auswahl werden alle angezeigt</span>
                <button v-if="stop.filters.length > 0" @click="[...stop.filters].forEach(f => store.removeFilter(stop.id, f.id))" class="text-xs text-red-400 font-medium active:opacity-60 ml-3">Alle abwählen</button>
              </div>
              <div
                v-for="(entry, idx) in availableLines[stop.id].lines"
                :key="`${entry.line}||${entry.direction}`"
                @click="toggleLine(stop, entry.line, entry.direction)"
                class="flex items-center px-4 py-3 active:bg-ios-gray dark:active:bg-ios-dark-elevated cursor-pointer"
                :class="idx < availableLines[stop.id].lines.length - 1 ? 'border-b border-gray-50 dark:border-ios-dark-separator' : ''"
              >
                <span class="text-xs font-bold px-2 py-0.5 rounded-md min-w-[2.5rem] text-center flex-shrink-0" :style="{ backgroundColor: getLineStyle(entry).bg, color: getLineStyle(entry).text }">{{ entry.line || '?' }}</span>
                <span class="flex-1 ml-3 text-sm text-ios-dark dark:text-white truncate">{{ entry.direction }}</span>
                <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ml-2 transition-colors" :class="isSelected(stop, entry.line, entry.direction) ? 'bg-ios-blue' : 'border-2 border-gray-300 dark:border-ios-dark-elevated'">
                  <svg v-if="isSelected(stop, entry.line, entry.direction)" width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
            <div v-else class="px-4 py-4 text-sm text-ios-secondary">Keine Linien gefunden</div>
          </div>
        </div>
      </div>
      <p v-if="store.stops.length === 0" class="text-center text-ios-secondary text-sm mt-2">
        Suche nach einer Haltestelle.
      </p>
    </div>

    <!-- ══ SEKTION: DATEN ══ -->
    <p class="text-xs font-semibold text-ios-secondary uppercase tracking-wide px-1 mb-2">Daten</p>
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-6" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div class="divide-y divide-gray-100 dark:divide-ios-dark-separator">
        <button @click="openQrExport" class="w-full flex items-center px-4 py-3.5 active:bg-ios-gray dark:active:bg-ios-dark-elevated text-left gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="text-ios-blue flex-shrink-0">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.75"/>
            <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.75"/>
            <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.75"/>
            <path d="M14 14h2v2h-2zM18 14h3v3h-3zM14 18h3v3h-3zM19 19h2v2h-2z" fill="currentColor"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-ios-dark dark:text-white">QR-Code exportieren</p>
            <p class="text-xs text-ios-secondary mt-0.5">Auf einem anderen Gerät scannen oder URL kopieren</p>
          </div>
        </button>
        <button @click="showImportModal = true; importText = ''; importError = ''" class="w-full flex items-center px-4 py-3.5 active:bg-ios-gray dark:active:bg-ios-dark-elevated text-left gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="text-ios-blue flex-shrink-0">
            <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 19h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-ios-dark dark:text-white">Einstellungen importieren</p>
            <p class="text-xs text-ios-secondary mt-0.5">Export-URL oder Code einfügen</p>
          </div>
        </button>
      </div>
    </div>

    <!-- ── QR-Export Modal ── -->
    <Teleport to="body">
      <div v-if="showQrModal" class="fixed inset-0 z-50 flex items-center justify-center p-6" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);" @click.self="showQrModal = false">
        <div class="bg-white dark:bg-ios-dark-card rounded-3xl p-6 w-full max-w-xs flex flex-col items-center gap-4" style="box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
          <h2 class="text-base font-semibold text-ios-dark dark:text-white">Einstellungen exportieren</h2>
          <p class="text-xs text-ios-secondary text-center">Kamera-App scannen (neues Gerät) · oder URL kopieren und in dieser App importieren.</p>
          <img :src="qrDataUrl" alt="QR-Code" class="rounded-xl w-56 h-56" />
          <button @click="copyExportUrl" class="w-full py-3 rounded-2xl border border-ios-blue text-ios-blue text-sm font-semibold active:opacity-80 transition-colors" :class="copyDone ? 'bg-ios-blue text-white' : ''">
            {{ copyDone ? 'URL kopiert ✓' : 'URL kopieren' }}
          </button>
          <button @click="showQrModal = false" class="w-full py-3 rounded-2xl bg-ios-blue text-white text-sm font-semibold active:opacity-80">Schließen</button>
        </div>
      </div>
    </Teleport>

    <!-- ── Import Modal ── -->
    <Teleport to="body">
      <div v-if="showImportModal" class="fixed inset-0 z-50 flex items-center justify-center p-6" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);" @click.self="showImportModal = false">
        <div class="bg-white dark:bg-ios-dark-card rounded-3xl p-6 w-full max-w-xs flex flex-col gap-4" style="box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
          <h2 class="text-base font-semibold text-ios-dark dark:text-white">Einstellungen importieren</h2>
          <p class="text-xs text-ios-secondary">Export-URL oder den reinen Base64-Code hier einfügen.</p>
          <textarea v-model="importText" rows="4" placeholder="https://departure.b65.ch/?import=…" class="w-full rounded-xl border border-gray-200 dark:border-ios-dark-separator bg-ios-gray dark:bg-ios-dark-elevated text-sm text-ios-dark dark:text-white p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ios-blue"/>
          <p v-if="importError" class="text-xs text-red-500">{{ importError }}</p>
          <button @click="confirmImport" :disabled="!importText.trim()" class="w-full py-3 rounded-2xl bg-ios-blue text-white text-sm font-semibold active:opacity-80 disabled:opacity-40">Importieren</button>
          <button @click="showImportModal = false" class="w-full py-2 text-sm text-ios-secondary">Abbrechen</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
