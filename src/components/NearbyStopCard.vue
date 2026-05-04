<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getCountdownMinutes } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'

const props = defineProps({
  stop: { type: Object, required: true },
  distanceKm: { type: Number, default: null },
  expanded: { type: Boolean, default: false },
  departures: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  fetchedAt: { type: Number, default: null },
  onToggle: { type: Function, required: true }
})

function formatDistance(km) {
  if (km === null) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

const tick = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => { tick.value = Date.now() }, 15000)
})
onUnmounted(() => clearInterval(timer))

function countdown(dep) {
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

function countdownPillClass(dep, secondary) {
  if (secondary) return 'bg-gray-100 dark:bg-ios-dark-elevated text-ios-secondary'
  const min = countdown(dep)
  if (min === null) return 'bg-gray-100 dark:bg-ios-dark-elevated text-ios-secondary'
  if (min <= 1) return 'bg-red-50 dark:bg-red-950/40 text-red-500'
  if (min <= 4) return 'bg-orange-50 dark:bg-orange-950/40 text-orange-500'
  return 'bg-blue-50 dark:bg-blue-950/40 text-ios-blue'
}

function lineName(dep) {
  return dep.servingLine?.number || dep.servingLine?.symbol || '?'
}

function direction(dep) {
  return dep.servingLine?.direction || ''
}
</script>

<template>
  <div class="mb-4">
    <!-- Header Card -->
    <div
      @click="onToggle()"
      class="bg-ios-blue/10 dark:bg-ios-blue/20 border-2 border-ios-blue rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer active:opacity-60 transition-all"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        class="text-ios-blue flex-shrink-0 transition-transform duration-200"
        :class="{ 'rotate-90': expanded }"
      >
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      
      <!-- Location Icon -->
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="text-ios-blue flex-shrink-0"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
      
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold text-ios-blue uppercase tracking-wide">In deiner Nähe</span>
        </div>
        <h2 class="font-bold text-ios-dark dark:text-white text-base leading-tight truncate">
          {{ stop.name }}
        </h2>
      </div>
      
      <span v-if="formatDistance(distanceKm)"
        class="text-xs font-semibold text-ios-blue bg-ios-blue/10 dark:bg-ios-blue/20 px-2.5 py-1 rounded-full flex-shrink-0">
        {{ formatDistance(distanceKm) }}
      </span>
    </div>

    <!-- Expandierter Bereich -->
    <div v-if="expanded" class="mt-3 px-1">
      <!-- Loading -->
      <div v-if="loading && departures.length === 0" class="flex flex-col gap-2">
        <div v-for="i in 5" :key="i" class="flex items-center px-2 py-2.5 gap-3 animate-pulse rounded-xl bg-gray-50 dark:bg-ios-dark-elevated">
          <div class="h-7 w-12 rounded-xl bg-gray-200 dark:bg-ios-dark-separator flex-shrink-0"></div>
          <div class="flex-1 h-4 rounded-lg bg-gray-200 dark:bg-ios-dark-separator" :style="{ maxWidth: i % 2 === 0 ? '55%' : '40%' }"></div>
          <div class="flex gap-2">
            <div class="h-7 w-14 rounded-full bg-gray-200 dark:bg-ios-dark-separator"></div>
          </div>
        </div>
      </div>

      <!-- Fehler -->
      <div v-else-if="error" class="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-xl">{{ error }}</div>

      <!-- Keine Abfahrten -->
      <div v-else-if="departures.length === 0" class="text-sm text-ios-secondary bg-gray-50 dark:bg-ios-dark-elevated px-3 py-2 rounded-xl">
        Keine Abfahrten gefunden
      </div>

      <!-- Abfahrten -->
      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="dep in departures"
          :key="dep.servingLine?.symbol + dep.servingLine?.direction + dep.dateTime?.minute"
          class="flex items-center px-2 py-2.5 gap-3 rounded-xl bg-white dark:bg-ios-dark-elevated border border-gray-100 dark:border-ios-dark-separator"
        >
          <!-- Linienbadge -->
          <span
            class="text-sm font-bold px-3 py-1.5 rounded-xl min-w-[3.25rem] text-center flex-shrink-0 leading-none"
            :style="{ backgroundColor: getLineStyle(dep.servingLine).bg, color: getLineStyle(dep.servingLine).text }"
          >
            {{ lineName(dep) }}
          </span>

          <!-- Richtung -->
          <span class="flex-1 text-[13px] text-ios-secondary dark:text-gray-400 truncate">
            {{ direction(dep) }}
          </span>

          <!-- Zeitpille -->
          <span
            class="text-[13px] font-bold tabular-nums px-2.5 py-1 rounded-full leading-none"
            :class="countdownPillClass(dep, false)"
          >
            {{ formatCountdown(dep) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
