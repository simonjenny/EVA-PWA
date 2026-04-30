<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { searchStops, planTrip, findNearestStop } from '../services/efa.js'
import { useSettingsStore } from '../stores/settings.js'
import { getLineStyle } from '../utils/lineColors.js'

const router = useRouter()
const settingsStore = useSettingsStore()

const SESSION_KEY = 'trip-planner-state'

// ─── Haltestellen-Suche ───────────────────────────────────
const originQuery = ref('')
const originResults = ref([])
const originSelected = ref(null)
const originSearching = ref(false)
const originFocused = ref(false)

const destQuery = ref('')
const destResults = ref([])
const destSelected = ref(null)
const destSearching = ref(false)
const destFocused = ref(false)

let originTimeout = null
let destTimeout = null

function debounceSearch(query, results, searching, timeout) {
  return (val) => {
    clearTimeout(timeout)
    results.value = []
    if (val.trim().length < 2) { searching.value = false; return }
    searching.value = true
    return new Promise(resolve => {
      timeout = setTimeout(async () => {
        try {
          results.value = await searchStops(val)
        } catch { results.value = [] }
        finally { searching.value = false }
        resolve()
      }, 350)
    })
  }
}

watch(originQuery, async (val) => {
  if (originSelected.value && originSelected.value.name === val) return
  originSelected.value = null
  clearTimeout(originTimeout)
  originResults.value = []
  if (val.trim().length < 2) { originSearching.value = false; return }
  originSearching.value = true
  originTimeout = setTimeout(async () => {
    try { originResults.value = await searchStops(val) }
    catch { originResults.value = [] }
    finally { originSearching.value = false }
  }, 350)
})

watch(destQuery, async (val) => {
  if (destSelected.value && destSelected.value.name === val) return
  destSelected.value = null
  clearTimeout(destTimeout)
  destResults.value = []
  if (val.trim().length < 2) { destSearching.value = false; return }
  destSearching.value = true
  destTimeout = setTimeout(async () => {
    try { destResults.value = await searchStops(val) }
    catch { destResults.value = [] }
    finally { destSearching.value = false }
  }, 350)
})

function selectOrigin(stop) {
  originSelected.value = stop
  originQuery.value = stop.name
  originResults.value = []
  originFocused.value = false
  settingsStore.addToStationHistory(stop)
}

function selectDest(stop) {
  destSelected.value = stop
  destQuery.value = stop.name
  destResults.value = []
  destFocused.value = false
  settingsStore.addToStationHistory(stop)
}

function swapStops() {
  const tmpStop = originSelected.value
  const tmpQuery = originQuery.value
  originSelected.value = destSelected.value
  originQuery.value = destQuery.value
  destSelected.value = tmpStop
  destQuery.value = tmpQuery
}

// ─── Take Me Home ─────────────────────────────────────────
const takeMeHomeLoading = ref(false)
const takeMeHomeError = ref(null)

async function takeMeHome() {
  const home = settingsStore.homeStop
  if (!home) return

  takeMeHomeError.value = null
  takeMeHomeLoading.value = true

  try {
    // Aktuellen Standort ermitteln (erst GPS, dann Haltestelle, dann Formular füllen)
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 })
    )
    const { latitude: lat, longitude: lon } = pos.coords

    const nearby = await findNearestStop(lat, lon)
    if (!nearby) throw new Error('Keine Haltestelle in der Nähe gefunden.')

    // Formular füllen
    originSelected.value = nearby
    originQuery.value = nearby.name

    const homeDest = { id: home.stopId, name: home.stopName, lat: home.lat, lon: home.lon }
    destSelected.value = homeDest
    destQuery.value = home.stopName

    const now = new Date()
    selectedDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    selectedTime.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    depArrMacro.value = 'dep'

    await search()
  } catch (e) {
    if (e.code === 1) {
      takeMeHomeError.value = 'Standortzugriff verweigert.'
    } else if (e.code === 3) {
      takeMeHomeError.value = 'Standort-Timeout. Bitte nochmals versuchen.'
    } else {
      takeMeHomeError.value = e.message || 'Unbekannter Fehler.'
    }
  } finally {
    takeMeHomeLoading.value = false
  }
}

// ─── Datum / Zeit / Modus ────────────────────────────────
const now = new Date()
const pad = n => String(n).padStart(2, '0')
const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`

const selectedDate = ref(defaultDate)
const selectedTime = ref(defaultTime)
const depArrMacro = ref('dep') // 'dep' | 'arr'  (itdTripDateTimeDepArr)

// ─── Suche / Ergebnis ────────────────────────────────────
const trips = ref([])
const tripsWithDisruption = ref(new Set())
const loading = ref(false)
const error = ref(null)
const searched = ref(false)

// Zustand aus sessionStorage wiederherstellen (nach Back-Navigation)
function legHasInfos(leg) {
  if (!leg.infos) return false
  if (Array.isArray(leg.infos)) return leg.infos.length > 0
  return !!(leg.infos.info)
}

function propagateInfos(result) {
  const lineInfoMap = new Map()
  for (const trip of result) {
    for (const leg of getLegs(trip)) {
      if (legHasInfos(leg)) {
        const key = leg.mode?.number || leg.mode?.name
        if (key && !lineInfoMap.has(key)) lineInfoMap.set(key, leg.infos)
      }
    }
  }
  if (lineInfoMap.size > 0) {
    for (const trip of result) {
      for (const leg of getLegs(trip)) {
        if (!legHasInfos(leg)) {
          const key = leg.mode?.number || leg.mode?.name
          if (key && lineInfoMap.has(key)) leg.infos = lineInfoMap.get(key)
        }
      }
    }
  }
  return result
}

function computeDisruptions(result) {
  const set = new Set()
  result.forEach((trip, i) => {
    if (getLegs(trip).some(leg => legHasInfos(leg))) set.add(i)
  })
  tripsWithDisruption.value = set
}

onMounted(() => {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      const s = JSON.parse(saved)
      if (s.originSelected) { originSelected.value = s.originSelected; originQuery.value = s.originSelected.name }
      if (s.destSelected) { destSelected.value = s.destSelected; destQuery.value = s.destSelected.name }
      if (s.selectedDate) selectedDate.value = s.selectedDate
      if (s.selectedTime) selectedTime.value = s.selectedTime
      if (s.depArrMacro) depArrMacro.value = s.depArrMacro
      if (s.trips?.length) {
        const loaded = propagateInfos(s.trips)
        trips.value = loaded
        computeDisruptions(loaded)
        searched.value = true
      }
    }
  } catch { /* ignorieren */ }
})

function saveState() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      originSelected: originSelected.value,
      destSelected: destSelected.value,
      selectedDate: selectedDate.value,
      selectedTime: selectedTime.value,
      depArrMacro: depArrMacro.value,
      trips: trips.value
    }))
  } catch { /* ignorieren */ }
}

async function search() {
  if (!originSelected.value || !destSelected.value) return
  loading.value = true
  error.value = null
  trips.value = []
  searched.value = true
  try {
    const [year, month, day] = selectedDate.value.split('-').map(Number)
    const [hour, minute] = selectedTime.value.split(':').map(Number)
    const dt = new Date(year, month - 1, day, hour, minute)
    const result = await planTrip(
      originSelected.value.id,
      destSelected.value.id,
      dt,
      depArrMacro.value
    )
    propagateInfos(result)
    computeDisruptions(result)
    trips.value = result
    saveState()
  } catch (e) {
    error.value = 'Verbindung konnte nicht geladen werden. Bitte prüfe deine Internetverbindung.'
  } finally {
    loading.value = false
  }
}

// ─── Hilfsfunktionen für Anzeige ─────────────────────────

// dateTime hat in der API das Format { time: "11:32", date: "29.04.2026", ... }
function formatTime(dt) {
  if (!dt) return '–'
  // Echtformat: dt.time = "11:32"
  if (dt.time) return dt.time.substring(0, 5)
  return '–'
}

function ensureArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function getLegs(trip) {
  // legs ist direkt ein Array in der API-Antwort
  const raw = trip.legs
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (raw.leg) return ensureArray(raw.leg)
  return []
}

// points ist Array [departure-point, arrival-point]
function getLegDep(leg) {
  const pts = leg.points
  return Array.isArray(pts) ? pts[0] : pts
}

function getLegArr(leg) {
  const pts = leg.points
  return Array.isArray(pts) ? pts[pts.length - 1] : pts
}

function getTripDep(trip) {
  const legs = getLegs(trip)
  if (!legs.length) return null
  return getLegDep(legs[0])?.dateTime
}

function getTripArr(trip) {
  const legs = getLegs(trip)
  if (!legs.length) return null
  return getLegArr(legs[legs.length - 1])?.dateTime
}

function formatDuration(trip) {
  // duration kommt als "HH:MM" z.B. "00:55"
  if (!trip?.duration) return null
  const [h, m] = trip.duration.split(':').map(Number)
  const total = h * 60 + m
  if (total < 60) return `${total} Min.`
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`
}

function getLegLine(leg) {
  return leg.mode?.number || leg.mode?.name || null
}

function getLegMode(leg) {
  // Echte EFA-BVB Werte (verifiziert):
  // type=3 → Bus, type=4 → Tram, type=6 → Zug/Regionalzug, type=99/100 → Fussweg
  const t = leg.mode?.type
  if (!t) return 'walk'
  const m = parseInt(t)
  if (m === 99 || m === 100) return 'walk'
  if (m === 1) return 'train'      // Fernzug
  if (m === 2) return 'suburban'   // S-Bahn
  if (m === 3) return 'bus'        // Bus (BVB etc.)
  if (m === 4) return 'tram'       // Tram
  if (m === 5) return 'bus'        // Stadtbus
  if (m === 6) return 'train'      // Regionalzug / R-Bahn
  if (m === 7) return 'bus'        // Nachtbus
  return 'transit'
}

function getLegModeLabel(leg) {
  const t = leg.mode?.type
  if (!t) return null
  const m = parseInt(t)
  if (m === 99 || m === 100) return null
  if (m === 1) return leg.mode?.trainType || 'Zug'
  if (m === 2) return 'S-Bahn'
  if (m === 3) return 'Bus'
  if (m === 4) return 'Tram'
  if (m === 5) return 'Bus'
  if (m === 6) return leg.mode?.trainType || 'Zug'
  if (m === 7) return 'Bus'
  return 'Linie'
}

function openDetail(trip) {
  const legs = getLegs(trip)
  const depDt = legs.length ? getLegDep(legs[0])?.dateTime : null
  router.push({
    path: '/trip/detail',
    query: {
      data: encodeURIComponent(JSON.stringify(trip)),
      from: originSelected.value?.id,
      to: destSelected.value?.id,
      date: selectedDate.value?.replace(/-/g, ''),
      dep: depDt?.time?.substring(0, 5) ?? selectedTime.value
    }
  })
}

// Zustand löschen wenn zu einer anderen Route navigiert wird (nicht zur Detail-Ansicht)
onBeforeRouteLeave((to) => {
  if (!to.path.startsWith('/trip')) {
    sessionStorage.removeItem(SESSION_KEY)
    originQuery.value = ''
    originSelected.value = ''
    destQuery.value = ''
    destSelected.value = null
    trips.value = []
    searched.value = false
  }
})

function getLegStyle(leg) {
  const mode = getLegMode(leg)
  if (mode === 'walk') return { bg: '#8E8E93', text: '#fff' }
  const number = leg.mode?.number || leg.mode?.name || ''
  const t = parseInt(leg.mode?.type ?? '5')
  const motTypeMap = { 1: 13, 2: 0, 3: 5, 4: 4, 5: 5, 6: 2, 7: 6 }
  const motType = motTypeMap[t] ?? 5
  return getLineStyle({ number, motType })
}
function getLegColor(leg) { return getLegStyle(leg).bg }

function isWalkLeg(leg) {
  return getLegMode(leg) === 'walk'
}

function getChanges(trip) {
  const legs = getLegs(trip).filter(l => !isWalkLeg(l))
  return Math.max(0, legs.length - 1)
}

// ─── Störungsmeldungen ───────────────────────────────────
function stripHtml(str) {
  return str ? str.replace(/<[^>]*>/g, ' ').replace(/&auml;/g,'ä').replace(/&ouml;/g,'ö').replace(/&uuml;/g,'ü').replace(/&Auml;/g,'Ä').replace(/&Ouml;/g,'Ö').replace(/&Uuml;/g,'Ü').replace(/&szlig;/g,'ß').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() : ''
}

function getLegDisruptions(leg) {
  const result = []
  // leg.infos kann direkt ein Array sein ODER { info: [...] }
  const infos = leg.infos
  if (infos) {
    let list = []
    if (Array.isArray(infos)) {
      list = infos
    } else if (infos.info) {
      list = Array.isArray(infos.info) ? infos.info : [infos.info]
    }
    for (const info of list) {
      const txt = info.infoText
      const title = txt?.subtitle || txt?.subject || info.infoLinkText || info.subtitle || info.subject || 'Störung'
      const rawText = txt?.content || txt?.additionalText || info.content || info.additionalText || ''
      result.push({ title, text: stripHtml(rawText) })
    }
  }
  // leg.hints.hint (type != Timetable = Störung)
  const hints = leg.hints
  if (hints) {
    const raw = hints.hint
    const list = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    for (const h of list) {
      if (h.type && h.type !== 'Timetable' && h.infoText) {
        result.push({ title: h.infoText, text: '' })
      }
    }
  }
  // Duplikate entfernen (gleicher Titel + Text)
  const seen = new Set()
  return result.filter(d => {
    const key = d.title + '|' + d.text
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasDisruptions(trip) {
  return getLegs(trip).some(leg => getLegDisruptions(leg).length > 0)
}

function parseTripDepDate(trip) {
  const dt = getTripDep(trip)
  if (!dt?.time || !dt?.date) return null
  // date format: "DD.MM.YYYY", time: "HH:MM"
  const [day, month, year] = dt.date.split('.')
  const [hour, minute] = dt.time.split(':')
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
}

const filteredTrips = computed(() => {
  const now = new Date()
  return trips.value.filter(trip => {
    const dep = parseTripDepDate(trip)
    return dep === null || dep >= now
  })
})
</script>

<template>
  <div class="min-h-screen bg-ios-bg dark:bg-ios-dark-bg pb-24">
    <!-- Header -->
    <div
      class="sticky top-0 z-20 bg-white dark:bg-ios-dark-card border-b border-ios-separator dark:border-ios-dark-separator px-4 pb-4"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 16px);"
    >
      <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight mb-4">Reiseplaner</h1>

      <!-- Von / Nach Felder -->
      <div class="bg-ios-bg dark:bg-ios-dark-bg rounded-xl overflow-visible relative">
        <!-- Von -->
        <div class="relative px-3 py-2.5 border-b border-ios-separator dark:border-ios-dark-separator">
          <label class="text-[11px] font-semibold text-ios-secondary uppercase tracking-wide block mb-0.5">Von</label>
          <input
            v-model="originQuery"
            type="text"
            placeholder="Starthaltestelle"
            class="w-full bg-transparent text-[16px] text-ios-label dark:text-white placeholder-ios-secondary outline-none"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            @focus="originFocused = true"
            @blur="originFocused = false"
          />
          <!-- Spinner -->
          <div v-if="originSearching" class="absolute right-3 top-1/2 -translate-y-1/2">
            <svg class="animate-spin w-4 h-4 text-ios-secondary" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
          <!-- Suchergebnis-Dropdown -->
          <div v-if="originResults.length" class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-ios-dark-card rounded-xl shadow-lg border border-ios-separator dark:border-ios-dark-separator z-50 overflow-hidden">
            <button
              v-for="stop in originResults.slice(0, 5)"
              :key="stop.id"
              @mousedown.prevent="selectOrigin(stop)"
              class="w-full text-left px-4 py-3 text-[15px] text-ios-label dark:text-white border-b border-ios-separator dark:border-ios-dark-separator last:border-0 active:bg-ios-bg dark:active:bg-ios-dark-bg"
            >
              <span class="font-medium">{{ stop.name }}</span>
              <span v-if="stop.place" class="text-ios-secondary text-[13px] ml-1">{{ stop.place }}</span>
            </button>
          </div>
          <!-- History-Dropdown -->
          <div v-else-if="originFocused && !originSearching && settingsStore.stationHistory.length" class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-ios-dark-card rounded-xl shadow-lg border border-ios-separator dark:border-ios-dark-separator z-50 overflow-hidden">
            <div class="px-4 py-2 text-[11px] font-semibold text-ios-secondary uppercase tracking-wide border-b border-ios-separator dark:border-ios-dark-separator">Zuletzt verwendet</div>
            <button
              v-for="stop in settingsStore.stationHistory.slice(0, 5)"
              :key="stop.id"
              @mousedown.prevent="selectOrigin(stop)"
              class="w-full text-left px-4 py-3 text-[15px] text-ios-label dark:text-white border-b border-ios-separator dark:border-ios-dark-separator last:border-0 active:bg-ios-bg dark:active:bg-ios-dark-bg flex items-center gap-2"
            >
              <svg class="w-4 h-4 text-ios-secondary flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>
                <span class="font-medium">{{ stop.name }}</span>
                <span v-if="stop.place" class="text-ios-secondary text-[13px] ml-1">{{ stop.place }}</span>
              </span>
            </button>
          </div>
        </div>

        <!-- Buttons: Tauschen + Nach Hause -->
        <div class="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
          <button
            @click="swapStops"
            class="w-8 h-8 flex items-center justify-center bg-white dark:bg-ios-dark-card border border-ios-separator dark:border-ios-dark-separator rounded-full shadow-sm active:scale-95 transition-transform"
            title="Tauschen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-ios-blue">
              <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            v-if="settingsStore.homeStop"
            @click="takeMeHome"
            :disabled="takeMeHomeLoading"
            class="w-8 h-8 flex items-center justify-center bg-white dark:bg-ios-dark-card border border-ios-separator dark:border-ios-dark-separator rounded-full shadow-sm active:scale-95 transition-transform disabled:opacity-40"
            :title="'Nach Hause: ' + settingsStore.homeStop.stopName"
          >
            <svg v-if="!takeMeHomeLoading" width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ios-blue">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="M9 21V13h6v8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
            <svg v-else class="animate-spin w-3.5 h-3.5 text-ios-blue" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </button>
        </div>

        <!-- Nach -->
        <div class="relative px-3 py-2.5">
          <label class="text-[11px] font-semibold text-ios-secondary uppercase tracking-wide block mb-0.5">Nach</label>
          <div class="flex items-center gap-2">
            <input
              v-model="destQuery"
              type="text"
              placeholder="Zielhaltestelle"
              class="flex-1 bg-transparent text-[16px] text-ios-label dark:text-white placeholder-ios-secondary outline-none"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              @focus="destFocused = true"
              @blur="destFocused = false"
            />

          </div>
          <div v-if="destSearching" class="absolute right-3 top-1/2 -translate-y-1/2">
            <svg class="animate-spin w-4 h-4 text-ios-secondary" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
          <!-- Suchergebnis-Dropdown -->
          <div v-if="destResults.length" class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-ios-dark-card rounded-xl shadow-lg border border-ios-separator dark:border-ios-dark-separator z-50 overflow-hidden">
            <button
              v-for="stop in destResults.slice(0, 5)"
              :key="stop.id"
              @mousedown.prevent="selectDest(stop)"
              class="w-full text-left px-4 py-3 text-[15px] text-ios-label dark:text-white border-b border-ios-separator dark:border-ios-dark-separator last:border-0 active:bg-ios-bg dark:active:bg-ios-dark-bg"
            >
              <span class="font-medium">{{ stop.name }}</span>
              <span v-if="stop.place" class="text-ios-secondary text-[13px] ml-1">{{ stop.place }}</span>
            </button>
          </div>
          <!-- History-Dropdown -->
          <div v-else-if="destFocused && !destSearching && settingsStore.stationHistory.length" class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-ios-dark-card rounded-xl shadow-lg border border-ios-separator dark:border-ios-dark-separator z-50 overflow-hidden">
            <div class="px-4 py-2 text-[11px] font-semibold text-ios-secondary uppercase tracking-wide border-b border-ios-separator dark:border-ios-dark-separator">Zuletzt verwendet</div>
            <button
              v-for="stop in settingsStore.stationHistory.slice(0, 5)"
              :key="stop.id"
              @mousedown.prevent="selectDest(stop)"
              class="w-full text-left px-4 py-3 text-[15px] text-ios-label dark:text-white border-b border-ios-separator dark:border-ios-dark-separator last:border-0 active:bg-ios-bg dark:active:bg-ios-dark-bg flex items-center gap-2"
            >
              <svg class="w-4 h-4 text-ios-secondary flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>
                <span class="font-medium">{{ stop.name }}</span>
                <span v-if="stop.place" class="text-ios-secondary text-[13px] ml-1">{{ stop.place }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Datum, Zeit, Modus -->
      <div class="mt-3 flex gap-2 items-center flex-wrap">
        <!-- Dep/Arr Toggle -->
        <div class="flex bg-ios-bg dark:bg-ios-dark-bg rounded-lg p-0.5 border border-ios-separator dark:border-ios-dark-separator">
          <button
            @click="depArrMacro = 'dep'"
            :class="depArrMacro === 'dep' ? 'bg-white dark:bg-ios-dark-card shadow text-ios-blue font-semibold' : 'text-ios-secondary'"
            class="px-3 py-1.5 rounded-md text-[13px] transition-all"
          >Abfahrt</button>
          <button
            @click="depArrMacro = 'arr'"
            :class="depArrMacro === 'arr' ? 'bg-white dark:bg-ios-dark-card shadow text-ios-blue font-semibold' : 'text-ios-secondary'"
            class="px-3 py-1.5 rounded-md text-[13px] transition-all"
          >Ankunft</button>
        </div>

        <!-- Datum -->
        <input
          v-model="selectedDate"
          type="date"
          class="flex-1 min-w-0 bg-ios-bg dark:bg-ios-dark-bg border border-ios-separator dark:border-ios-dark-separator rounded-lg px-3 py-1.5 text-[13px] text-ios-label dark:text-white outline-none"
        />

        <!-- Zeit -->
        <input
          v-model="selectedTime"
          type="time"
          class="bg-ios-bg dark:bg-ios-dark-bg border border-ios-separator dark:border-ios-dark-separator rounded-lg px-3 py-1.5 text-[13px] text-ios-label dark:text-white outline-none"
        />
      </div>

      <!-- Suchen Button -->
      <button
        @click="search"
        :disabled="!originSelected || !destSelected || loading"
        class="mt-3 w-full bg-ios-blue text-white font-semibold text-[16px] py-3 rounded-xl active:opacity-80 transition-opacity disabled:opacity-40"
      >
        <span v-if="loading" class="flex items-center justify-center gap-2">
          <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Suche läuft…
        </span>
        <span v-else>Verbindungen suchen</span>
      </button>

      <p v-if="takeMeHomeError" class="mt-1.5 text-[11px] text-red-500 text-center">{{ takeMeHomeError }}</p>
    </div>

    <!-- Ergebnisse -->
    <div class="px-4 pt-4">
      <!-- Fehler -->
      <div v-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400 text-[14px]">
        {{ error }}
      </div>

      <!-- Keine Ergebnisse -->
      <div v-else-if="searched && !loading && filteredTrips.length === 0" class="text-center text-ios-secondary py-12">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p class="text-[15px]">Keine Verbindungen gefunden.</p>
      </div>

      <!-- Trip-Karten -->
      <div v-else class="flex flex-col gap-3">
        <button
          v-for="(trip, idx) in filteredTrips"
          :key="idx"
          @click="openDetail(trip)"
          class="w-full text-left bg-white dark:bg-ios-dark-card rounded-2xl shadow-sm border border-ios-separator dark:border-ios-dark-separator overflow-hidden active:opacity-70 transition-opacity"
        >
          <!-- Zeiten + Dauer -->
          <div class="px-4 pt-4 pb-3 flex items-center gap-3">
            <!-- Abfahrt -->
            <div class="min-w-0">
              <div class="text-[26px] font-bold text-ios-label dark:text-white tabular-nums leading-none">{{ formatTime(getTripDep(trip)) }}</div>
              <div class="text-[11px] text-ios-secondary uppercase tracking-wide mt-1">Abfahrt</div>
            </div>
            <!-- Pfeil -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0 mt-[-10px]">
              <path d="M5 12h14M14 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <!-- Ankunft -->
            <div class="min-w-0">
              <div class="text-[26px] font-bold text-ios-label dark:text-white tabular-nums leading-none">{{ formatTime(getTripArr(trip)) }}</div>
              <div class="text-[11px] text-ios-secondary uppercase tracking-wide mt-1">Ankunft</div>
            </div>
            <!-- Spacer -->
            <div class="flex-1"></div>
            <!-- Dauer + Umstiege -->
            <div class="text-right flex-shrink-0">
              <div class="flex items-center justify-end gap-2">
                <svg v-if="hasDisruptions(trip)" width="15" height="15" viewBox="0 0 24 24" fill="none" class="text-yellow-500 flex-shrink-0 -translate-y-px">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span class="text-[15px] font-semibold text-ios-label dark:text-white">{{ formatDuration(trip) }}</span>
              </div>
              <div class="text-[12px] text-ios-secondary mt-0.5">
                {{ getChanges(trip) === 0 ? 'Direkt' : getChanges(trip) + (getChanges(trip) === 1 ? ' Umstieg' : ' Umstiege') }}
              </div>
            </div>
            <!-- Chevron -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0">
              <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Trennlinie -->
          <div class="mx-4 border-t border-ios-separator dark:border-ios-dark-separator"></div>

          <!-- Linien-Badges -->
          <div class="px-4 py-3 flex items-center gap-2 flex-wrap">
            <template v-for="(leg, li) in getLegs(trip)" :key="li">
              <!-- Fussweg -->
              <div v-if="isWalkLeg(leg)" class="flex items-center gap-1.5 text-ios-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2V23h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
                </svg>
                <span class="text-[13px]">Fussweg</span>
              </div>
              <!-- Transit -->
              <div v-else class="flex items-center gap-1.5">
                <span
                  class="px-2 py-0.5 rounded-md text-[13px] font-bold"
                  :style="{ backgroundColor: getLegStyle(leg).bg, color: getLegStyle(leg).text }"
                >{{ getLegLine(leg) || '?' }}</span>
                <span class="text-[13px] text-ios-label dark:text-white font-medium">{{ getLegModeLabel(leg) }}</span>
              </div>
              <!-- Pfeil zwischen Abschnitten -->
              <svg v-if="li < getLegs(trip).length - 1" width="10" height="10" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0">
                <path d="M5 12h14M14 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </template>
          </div>
        </button>
      </div>

      <!-- Placeholder wenn noch nicht gesucht -->
      <div v-if="!searched && !loading" class="text-center text-ios-secondary py-16">
        <svg class="w-20 h-20 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Startpunkt -->
          <circle cx="2.5" cy="18.5" r="1.75" stroke="currentColor" stroke-width="1.5"/>
          <!-- Geschwungene Route -->
          <path d="M4 18C5 14 2 10 6 8C10 6 10 11 14 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2.5 2"/>
          <!-- Bus -->
          <rect x="13.5" y="4" width="8.5" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M13.5 7.5h8.5" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="15.5" cy="12" r="1.1" fill="currentColor"/>
          <circle cx="20" cy="12" r="1.1" fill="currentColor"/>
          <path d="M15.5 4V3M20 4V3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <p class="text-[15px] font-medium">Wohin möchtest du?</p>
        <p class="text-[13px] mt-1">Gib Start und Ziel ein, um Verbindungen zu finden.</p>
      </div>
    </div>
  </div>
</template>
