import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'abfahrten-v1'
const DARK_MODE_KEY = 'abfahrten-darkmode-v1'
const REFRESH_KEY = 'abfahrten-refresh-v1'
const HOME_STOP_KEY = 'abfahrten-homestop-v1'

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'id-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const stops = ref(load())
  const darkMode = ref(localStorage.getItem(DARK_MODE_KEY) === 'true')
  const refreshInterval = ref(Number(localStorage.getItem(REFRESH_KEY)) || 30)

  // Heimhaltestelle: { id, stopId, stopName, lat, lon }
  const homeStop = ref((() => {
    try { return JSON.parse(localStorage.getItem(HOME_STOP_KEY)) } catch { return null }
  })())

  watch(homeStop, (val) => {
    if (val) localStorage.setItem(HOME_STOP_KEY, JSON.stringify(val))
    else localStorage.removeItem(HOME_STOP_KEY)
  }, { deep: true })

  watch(stops, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  }, { deep: true })

  watch(darkMode, (val) => {
    localStorage.setItem(DARK_MODE_KEY, String(val))
  })

  watch(refreshInterval, (val) => {
    localStorage.setItem(REFRESH_KEY, String(val))
  })

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
  }

  function addStop(stopId, stopName, lat = null, lon = null) {
    if (stops.value.some(s => s.stopId === stopId)) return
    stops.value.push({
      id: generateId(),
      stopId,
      stopName,
      lat,
      lon,
      filters: []
    })
  }

  function removeStop(id) {
    stops.value = stops.value.filter(s => s.id !== id)
  }

  function addFilter(stopId, line, direction) {
    const stop = stops.value.find(s => s.id === stopId)
    if (!stop) return
    stop.filters.push({
      id: generateId(),
      line: (line || '').trim(),
      direction: (direction || '').trim()
    })
  }

  function removeFilter(stopId, filterId) {
    const stop = stops.value.find(s => s.id === stopId)
    if (!stop) return
    stop.filters = stop.filters.filter(f => f.id !== filterId)
  }

  function setHomeStop(stop) {
    homeStop.value = stop  // { id, stopId, stopName, lat, lon } oder null
  }

  function clearAll() {
    stops.value = []
  }

  function setStopCoords(stopId, lat, lon) {
    const stop = stops.value.find(s => s.stopId === stopId)
    if (stop) { stop.lat = lat; stop.lon = lon }
  }

  return { stops, darkMode, refreshInterval, homeStop, addStop, removeStop, addFilter, removeFilter, toggleDarkMode, setStopCoords, setHomeStop, clearAll }
})
