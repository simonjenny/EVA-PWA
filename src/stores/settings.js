import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'abfahrten-v1'
const DARK_MODE_KEY = 'abfahrten-darkmode-v1'
const REFRESH_KEY = 'abfahrten-refresh-v1'

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

  function addStop(stopId, stopName) {
    if (stops.value.some(s => s.stopId === stopId)) return
    stops.value.push({
      id: generateId(),
      stopId,
      stopName,
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

  return { stops, darkMode, refreshInterval, addStop, removeStop, addFilter, removeFilter, toggleDarkMode }
})
