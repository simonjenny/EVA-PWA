<script setup>
import { ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings.js'
import { searchStops, getAvailableLines } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'

const store = useSettingsStore()

async function forceReload() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  }
  window.location.reload()
}

// ─── Suche ───────────────────────────────────────────────
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

  store.addStop(result.id, result.name)
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

// ─── Linie an-/abwählen ──────────────────────────────────────
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
    <div class="flex items-center justify-between gap-4 mb-4">
      <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight">Einstellungen</h1>
      <button
        @click="forceReload"
        class="text-ios-blue text-sm font-medium py-2 px-3 rounded-xl border border-ios-blue/10 transition hover:bg-ios-blue/5"
        type="button"
      >
        Aktualisieren
      </button>
    </div>

    <!-- ── Dark Mode Toggle ── -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-6" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
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

    <!-- ── Aktualisierungsintervall ── -->
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
          :class="store.refreshInterval === option
            ? 'text-ios-blue'
            : 'text-ios-secondary'"
        >
          {{ option >= 60 ? `${option / 60} min` : `${option} s` }}
        </button>
      </div>
    </div>

    <!-- ── Suchfeld ── -->
    <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden mb-6" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
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
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-ios-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Lade-Indikator -->
      <div v-if="searching" class="px-4 pb-4 text-ios-secondary text-sm flex items-center gap-2">
        <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Suche…
      </div>

      <!-- Fehler -->
      <div v-else-if="searchError" class="px-4 pb-4 text-sm text-red-500">
        {{ searchError }}
      </div>

      <!-- Kein Ergebnis -->
      <div v-else-if="searchQuery.length >= 2 && !searching && searchResults.length === 0"
        class="px-4 pb-4 text-sm text-ios-secondary">
        Keine Haltestellen gefunden
      </div>

      <!-- Suchergebnisse direkt inline -->
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

    <!-- ── Konfigurierte Haltestellen ── -->
    <div class="flex flex-col gap-4">
      <div
        v-for="stop in store.stops"
        :key="stop.id"
        class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden"
        style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);"
      >
        <!-- Stop-Header -->
        <div class="flex items-center px-4 py-4">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-ios-dark dark:text-white text-sm truncate">{{ stop.stopName }}</p>
            <p class="text-xs text-ios-secondary mt-0.5">
              <template v-if="stop.filters.length === 0">Alle Linien</template>
              <template v-else>{{ stop.filters.length }} Linie{{ stop.filters.length !== 1 ? 'n' : '' }} ausgewählt</template>
            </p>
          </div>
          <button
            @click="store.removeStop(stop.id)"
            class="ml-3 text-red-500 text-sm font-medium flex-shrink-0 active:opacity-60"
          >
            Entfernen
          </button>
        </div>

        <!-- Aktive Filter als Badges (Zusammenfassung, wenn Panel zu) -->
        <div v-if="stop.filters.length > 0 && openPanelFor !== stop.id" class="px-4 pb-3 flex flex-wrap gap-1.5">
          <span
            v-for="f in stop.filters"
            :key="f.id"
            class="inline-flex items-center gap-1 text-xs rounded-lg pl-1.5 pr-2 py-1"
            :style="{ backgroundColor: getLineStyle({ number: f.line }).bg + '20', color: getLineStyle({ number: f.line }).bg }"
          >
            <span
              class="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
              :style="{ backgroundColor: getLineStyle({ number: f.line }).bg, color: getLineStyle({ number: f.line }).text }"
            >{{ f.line || '?' }}</span>
            <span class="truncate max-w-[120px]">{{ f.direction }}</span>
          </span>
        </div>

        <!-- Linien-Auswahl Bereich -->
        <div class="border-t border-gray-100 dark:border-ios-dark-separator">

          <!-- Toggle-Button -->
          <button
            @click="togglePanel(stop)"
            class="w-full flex items-center justify-between px-4 py-3 active:bg-ios-gray dark:active:bg-ios-dark-elevated"
          >
            <span class="text-sm text-ios-blue font-medium">
              {{ openPanelFor === stop.id ? 'Auswahl schließen' : 'Linien auswählen' }}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              class="text-ios-secondary transition-transform"
              :class="openPanelFor === stop.id ? 'rotate-180' : ''"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- Panel -->
          <div v-if="openPanelFor === stop.id" class="border-t border-gray-100 dark:border-ios-dark-separator">

            <!-- Laden -->
            <div v-if="availableLines[stop.id]?.loading" class="px-4 py-5 flex items-center gap-2 text-ios-secondary text-sm">
              <svg class="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Linien werden geladen…
            </div>

            <!-- Fehler -->
            <div v-else-if="availableLines[stop.id]?.error" class="px-4 py-4 text-sm text-red-500">
              {{ availableLines[stop.id].error }}
            </div>

            <!-- Linien-Liste -->
            <div v-else-if="availableLines[stop.id]?.lines.length > 0">

              <!-- Alle abwählen -->
              <div class="px-4 py-2.5 flex items-center justify-between border-b border-gray-50 dark:border-ios-dark-separator">
                <span class="text-xs text-ios-secondary">Ohne Auswahl werden alle angezeigt</span>
                <button
                  v-if="stop.filters.length > 0"
                  @click="[...stop.filters].forEach(f => store.removeFilter(stop.id, f.id))"
                  class="text-xs text-red-400 font-medium active:opacity-60 ml-3"
                >
                  Alle abwählen
                </button>
              </div>

              <!-- Jede Linie/Richtung als Zeile -->
              <div
                v-for="(entry, idx) in availableLines[stop.id].lines"
                :key="`${entry.line}||${entry.direction}`"
                @click="toggleLine(stop, entry.line, entry.direction)"
                class="flex items-center px-4 py-3 active:bg-ios-gray dark:active:bg-ios-dark-elevated cursor-pointer"
                :class="idx < availableLines[stop.id].lines.length - 1 ? 'border-b border-gray-50 dark:border-ios-dark-separator' : ''"
              >
                <!-- Linienbadge -->
                <span
                  class="text-xs font-bold px-2 py-0.5 rounded-md min-w-[2.5rem] text-center flex-shrink-0"
                  :style="{ backgroundColor: getLineStyle(entry).bg, color: getLineStyle(entry).text }"
                >
                  {{ entry.line || '?' }}
                </span>

                <!-- Richtung -->
                <span class="flex-1 ml-3 text-sm text-ios-dark dark:text-white truncate">{{ entry.direction }}</span>

                <!-- Runder Checkmark -->
                <div
                  class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ml-2 transition-colors"
                  :class="isSelected(stop, entry.line, entry.direction)
                    ? 'bg-ios-blue'
                    : 'border-2 border-gray-300 dark:border-ios-dark-elevated'"
                >
                  <svg
                    v-if="isSelected(stop, entry.line, entry.direction)"
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                  >
                    <path d="M5 13l4 4L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- Keine Linien -->
            <div v-else class="px-4 py-4 text-sm text-ios-secondary">
              Keine Linien gefunden
            </div>
          </div>
        </div>
      </div>

      <!-- Hinweis wenn keine Haltestellen -->
      <p v-if="store.stops.length === 0" class="text-center text-ios-secondary text-sm mt-2">
        Suche nach einer Haltestelle.
      </p>
    </div>
  </div>
</template>
