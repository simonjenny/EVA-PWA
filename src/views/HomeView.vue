<script>
export default { name: 'HomeView' }
</script>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../stores/settings.js'
import { getDepartures, filterDepartures, resolveStopCoords, findNearestStop, getCountdownMinutes } from '../services/efa.js'
import StopCard from '../components/StopCard.vue'
import NearbyStopCard from '../components/NearbyStopCard.vue'

const store = useSettingsStore()
const stopData = ref({})
let refreshTimer = null
let geoWatcher = null

const userLat = ref(null)
const userLon = ref(null)
const gpsStatus = ref('pending')

const nearbyStop = ref(null)
const nearbyStopExpanded = ref(false)
const nearbyStopDepartures = ref([])
const nearbyStopLoading = ref(false)
const nearbyStopFetchedAt = ref(null)
const nearbyStopError = ref(null)

function startGeoWatch() {
  if (!navigator.geolocation) { gpsStatus.value = 'denied'; return }
  if (geoWatcher !== null) return
  geoWatcher = navigator.geolocation.watchPosition(
    pos => {
      userLat.value = pos.coords.latitude
      userLon.value = pos.coords.longitude
      gpsStatus.value = 'ok'
      updateNearbyStop()
    },
    () => { 
      gpsStatus.value = 'denied'
      nearbyStop.value = null
    },
    { enableHighAccuracy: false, maximumAge: 60000 }
  )
}

async function updateNearbyStop() {
  if (userLat.value === null || userLon.value === null) {
    nearbyStop.value = null
    return
  }
  try {
    const nearest = await findNearestStop(userLat.value, userLon.value)
    if (!nearest) {
      nearbyStop.value = null
      return
    }
    const isConfigured = store.stops.some(s => s.stopId === nearest.id)
    if (isConfigured) {
      nearbyStop.value = null
    } else {
      nearbyStop.value = nearest
      if (nearbyStopExpanded.value) {
        fetchNearbyStopDepartures()
      }
    }
  } catch {
    nearbyStop.value = null
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function ensureStopCoords() {
  await Promise.all(
    store.stops
      .filter(s => s.lat == null || s.lon == null)
      .map(async s => {
        const coords = await resolveStopCoords(s.stopId)
        if (coords) store.setStopCoords(s.stopId, coords.lat, coords.lon)
      })
  )
}

const sortedStops = computed(() => {
  if (userLat.value === null || userLon.value === null) return store.stops
  return [...store.stops].sort((a, b) => {
    if (a.lat == null || a.lon == null) return 1
    if (b.lat == null || b.lon == null) return -1
    return haversineKm(userLat.value, userLon.value, a.lat, a.lon)
         - haversineKm(userLat.value, userLon.value, b.lat, b.lon)
  })
})

function initStopData() {
  for (const stop of store.stops) {
    if (!stopData.value[stop.id]) {
      stopData.value[stop.id] = {
        departures: [],
        fetchedAt: null,
        loading: true,
        error: null,
        expanded: false,
        allDepartures: [],
        allDeparturesLoading: false,
        allDeparturesFetchedAt: null
      }
    }
  }
}

async function fetchNearbyStopDepartures() {
  if (!nearbyStop.value) return
  nearbyStopLoading.value = true
  nearbyStopError.value = null
  try {
    const all = await getDepartures(nearbyStop.value.id)
    const sorted = all.sort((a, b) => {
      const aMin = getCountdownMinutes(a, nearbyStopFetchedAt.value)
      const bMin = getCountdownMinutes(b, nearbyStopFetchedAt.value)
      if (aMin === null && bMin === null) return 0
      if (aMin === null) return 1
      if (bMin === null) return -1
      return aMin - bMin
    })
    nearbyStopDepartures.value = sorted.slice(0, store.maxDepartures)
    nearbyStopFetchedAt.value = Date.now()
  } catch {
    nearbyStopError.value = 'Verbindungsfehler – bitte prüfe deine Verbindung'
  } finally {
    nearbyStopLoading.value = false
  }
}

function toggleNearbyStop() {
  nearbyStopExpanded.value = !nearbyStopExpanded.value
  if (nearbyStopExpanded.value && nearbyStop.value) {
    fetchNearbyStopDepartures()
  }
}

async function fetchStop(stop) {
  if (!stopData.value[stop.id]) {
    stopData.value[stop.id] = {
      departures: [],
      fetchedAt: null,
      loading: true,
      error: null,
      expanded: false,
      allDepartures: [],
      allDeparturesLoading: false,
      allDeparturesFetchedAt: null
    }
  }
  stopData.value[stop.id].loading = true
  stopData.value[stop.id].error = null
  try {
    const all = await getDepartures(stop.stopId)
    const filtered = filterDepartures(all, stop.filters)
    stopData.value[stop.id].departures = filtered.slice(0, store.maxDepartures)
    stopData.value[stop.id].fetchedAt = Date.now()
  } catch {
    stopData.value[stop.id].error = 'Verbindungsfehler – bitte prüfe deine Verbindung'
  } finally {
    stopData.value[stop.id].loading = false
  }
}

async function fetchStopAllDepartures(stop) {
  if (!stopData.value[stop.id]) return
  stopData.value[stop.id].allDeparturesLoading = true
  try {
    const all = await getDepartures(stop.stopId)
    const sorted = all.sort((a, b) => {
      const aMin = getCountdownMinutes(a, stopData.value[stop.id].allDeparturesFetchedAt)
      const bMin = getCountdownMinutes(b, stopData.value[stop.id].allDeparturesFetchedAt)
      if (aMin === null && bMin === null) return 0
      if (aMin === null) return 1
      if (bMin === null) return -1
      return aMin - bMin
    })
    stopData.value[stop.id].allDepartures = sorted.slice(0, store.maxDepartures)
    stopData.value[stop.id].allDeparturesFetchedAt = Date.now()
  } catch {
    // Fehler stillschweigend ignorieren
  } finally {
    stopData.value[stop.id].allDeparturesLoading = false
  }
}

function toggleStopExpand(stopId) {
  if (!stopData.value[stopId]) return
  stopData.value[stopId].expanded = !stopData.value[stopId].expanded
  if (stopData.value[stopId].expanded) {
    const stop = store.stops.find(s => s.id === stopId)
    if (stop) fetchStopAllDepartures(stop)
  }
}

const loadingCount = ref(0)
const isLoading = computed(() => loadingCount.value > 0)

async function refreshAll() {
  loadingCount.value = store.stops.length
  ensureStopCoords()
  if (nearbyStop.value && nearbyStopExpanded.value) {
    fetchNearbyStopDepartures()
  }
  store.stops.forEach(async (stop) => {
    await fetchStop(stop)
    if (stopData.value[stop.id]?.expanded) {
      await fetchStopAllDepartures(stop)
    }
    loadingCount.value--
  })
}

onMounted(() => {
  initStopData()
  startGeoWatch()
  refreshAll()
  refreshTimer = setInterval(refreshAll, store.refreshInterval * 1000)
})

watch(() => store.refreshInterval, val => {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(refreshAll, val * 1000)
})

watch(() => store.stops, () => {
  updateNearbyStop()
}, { deep: true })

onUnmounted(() => {
  clearInterval(refreshTimer)
  if (geoWatcher !== null) navigator.geolocation?.clearWatch(geoWatcher)
})
</script>

<template>
  <div class="px-4 pb-6" style="padding-top: calc(env(safe-area-inset-top, 0px) + 16px);">
    <!-- Header -->
    <div class="flex items-end justify-between mb-5">
      <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight">Abfahrten</h1>
      <button
        @click="refreshAll"
        class="text-ios-blue p-1 active:opacity-50 transition-opacity"
        aria-label="Aktualisieren"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="transform-box: fill-box; transform-origin: center;" :class="{ 'spin-reverse': isLoading }">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8z" />
          <path d="M12 20v3l4-4-4-4v3c-3.31 0-6-2.69-6-6 0-1.01-.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8z" />
        </svg>
      </button>
    </div>

    <!-- Nearby Stop Card -->
    <NearbyStopCard
      v-if="nearbyStop"
      :stop="nearbyStop"
      :distance-km="(userLat !== null && userLon !== null && nearbyStop.lat !== null && nearbyStop.lon !== null) ? haversineKm(userLat, userLon, nearbyStop.lat, nearbyStop.lon) : null"
      :expanded="nearbyStopExpanded"
      :departures="nearbyStopDepartures"
      :loading="nearbyStopLoading"
      :error="nearbyStopError"
      :fetched-at="nearbyStopFetchedAt"
      :on-toggle="toggleNearbyStop"
    />

    <!-- Leer-Zustand -->
    <div v-if="store.stops.length === 0 && !nearbyStop" class="flex flex-col items-center mt-20 gap-4 text-center">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" class="text-ios-secondary opacity-50">
        <rect x="3" y="3" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.5" />
        <path d="M3 9h18" stroke="currentColor" stroke-width="1.5" />
        <circle cx="7.5" cy="20" r="1.5" fill="currentColor" />
        <circle cx="16.5" cy="20" r="1.5" fill="currentColor" />
        <path d="M7.5 17v1.5M16.5 17v1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <p class="text-ios-secondary text-base">Noch keine Haltestellen konfiguriert</p>
      <router-link
        to="/settings"
        class="text-ios-blue font-medium text-base"
      >
        Zu den Einstellungen →
      </router-link>
    </div>

    <!-- Haltestellen-Karten -->
    <div v-if="store.stops.length > 0" class="flex flex-col gap-4">
      <StopCard
        v-for="stop in sortedStops"
        :key="stop.id"
        :stop="stop"
        :departures="stopData[stop.id]?.departures ?? []"
        :fetched-at="stopData[stop.id]?.fetchedAt ?? null"
        :loading="stopData[stop.id]?.loading ?? true"
        :error="stopData[stop.id]?.error ?? null"
        :distance-km="(userLat !== null && userLon !== null && stop.lat != null && stop.lon != null) ? haversineKm(userLat, userLon, stop.lat, stop.lon) : null"
        :expanded="stopData[stop.id]?.expanded ?? false"
        :all-departures="stopData[stop.id]?.allDepartures ?? []"
        :all-departures-loading="stopData[stop.id]?.allDeparturesLoading ?? false"
        :all-departures-fetched-at="stopData[stop.id]?.allDeparturesFetchedAt ?? null"
        :on-toggle="() => toggleStopExpand(stop.id)"
      />
    </div>
  </div>
</template>
