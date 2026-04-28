<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getCountdownMinutes } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'

const props = defineProps({
  stop: { type: Object, required: true },
  departures: { type: Array, default: () => [] },
  fetchedAt: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null }
})

// Timer damit der Countdown auch zwischen Refreshes läuft
const tick = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => { tick.value = Date.now() }, 15000)
})
onUnmounted(() => clearInterval(timer))

function countdown(dep) {
  // tick.value zur Reaktivität auslesen
  void tick.value
  return getCountdownMinutes(dep, props.fetchedAt)
}

function formatCountdown(dep) {
  const min = countdown(dep)
  if (min === null) return '—'
  if (min <= 0) return 'Jetzt'
  if (min === 1) return '1 min'
  return `${min} min`
}

function countdownClass(dep) {
  const min = countdown(dep)
  if (min === null) return 'text-ios-secondary'
  if (min <= 1) return 'text-red-500'
  if (min <= 4) return 'text-orange-500'
  return 'text-ios-blue'
}

function lineName(dep) {
  return dep.servingLine?.number || dep.servingLine?.symbol || '?'
}

function direction(dep) {
  return dep.servingLine?.direction || ''
}
</script>

<template>
  <div class="bg-white dark:bg-ios-dark-card rounded-2xl overflow-hidden" style="box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-ios-dark-separator">
      <div class="flex items-center gap-2">
        <!-- Bus-Stop Icon -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ios-secondary flex-shrink-0">
          <rect x="3" y="3" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.75"/>
          <path d="M3 9h18" stroke="currentColor" stroke-width="1.75"/>
          <circle cx="7.5" cy="20" r="1.5" fill="currentColor"/>
          <circle cx="16.5" cy="20" r="1.5" fill="currentColor"/>
          <path d="M7.5 17v1.5M16.5 17v1.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
        <h2 class="font-semibold text-ios-dark dark:text-white text-sm leading-tight">{{ stop.stopName }}</h2>
      </div>
    </div>

    <!-- Fehler -->
    <div v-if="error" class="px-4 py-4 text-sm text-red-500">
      {{ error }}
    </div>

    <!-- Skeleton (nur beim ersten Laden, solange noch keine Daten da sind) -->
    <div v-else-if="loading && departures.length === 0">
      <div
        v-for="i in 2"
        :key="i"
        class="flex items-center px-4 py-3 gap-3 animate-pulse"
        :class="i < 2 ? 'border-b border-gray-50 dark:border-ios-dark-separator' : ''"
      >
        <div class="h-5 w-11 rounded-md bg-gray-200 dark:bg-ios-dark-elevated flex-shrink-0"></div>
        <div class="flex-1 h-4 rounded bg-gray-200 dark:bg-ios-dark-elevated" :style="{ maxWidth: i === 1 ? '60%' : '45%' }"></div>
        <div class="h-4 w-12 rounded bg-gray-200 dark:bg-ios-dark-elevated flex-shrink-0"></div>
      </div>
    </div>

    <!-- Keine Abfahrten -->
    <div v-else-if="departures.length === 0" class="px-4 py-4 text-sm text-ios-secondary">
      Keine passenden Abfahrten gefunden
    </div>

    <!-- Abfahrten -->
    <div v-else>
      <div
        v-for="(dep, idx) in departures"
        :key="idx"
        class="flex items-center px-4 py-3 gap-3"
        :class="idx < departures.length - 1 ? 'border-b border-gray-50 dark:border-ios-dark-separator' : ''"
      >
        <!-- Linienbadge -->
        <span
          class="text-xs font-bold px-2 py-0.5 rounded-md min-w-[2.75rem] text-center flex-shrink-0"
          :style="{ backgroundColor: getLineStyle(dep.servingLine).bg, color: getLineStyle(dep.servingLine).text }"
        >
          {{ lineName(dep) }}
        </span>

        <!-- Richtung -->
        <span class="flex-1 text-sm text-ios-dark dark:text-white truncate">{{ direction(dep) }}</span>

        <!-- Countdown -->
        <span class="text-sm font-semibold tabular-nums flex-shrink-0" :class="countdownClass(dep)">
          {{ formatCountdown(dep) }}
        </span>
      </div>
    </div>
  </div>
</template>
