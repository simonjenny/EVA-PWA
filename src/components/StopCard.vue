<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCountdownMinutes } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'

const props = defineProps({
  stop: { type: Object, required: true },
  departures: { type: Array, default: () => [] },
  fetchedAt: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  distanceKm: { type: Number, default: null },
  expanded: { type: Boolean, default: false },
  allDepartures: { type: Array, default: () => [] },
  allDeparturesLoading: { type: Boolean, default: false },
  allDeparturesFetchedAt: { type: Number, default: null },
  onToggle: { type: Function, default: () => {} }
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

function countdownClass(dep) {
  const min = countdown(dep)
  if (min === null) return 'text-ios-secondary'
  if (min <= 1) return 'text-red-500'
  if (min <= 4) return 'text-orange-500'
  return 'text-ios-blue'
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

// Zwei Richtungen gelten als gleich, wenn ihr erster Namensteil übereinstimmt
// (z. B. "Weil am Rhein Bahnhof" ≈ "Weil am Rhein Zentrum")
function isSameDirection(dir1, dir2) {
  if (!dir1 || !dir2) return dir1 === dir2
  if (dir1 === dir2) return true
  const seg = s => s.split(',')[0].trim().split(' ')[0].toLowerCase()
  const s1 = seg(dir1), s2 = seg(dir2)
  return s1.length > 3 && s1 === s2
}

// Pro Linie max. 2 Abfahrten, ähnliche Richtungen in einer Zeile zusammenfassen
const groupedDepartures = computed(() => {
  const lineGroups = new Map()
  for (const dep of props.departures) {
    const line = lineName(dep)
    if (!lineGroups.has(line)) lineGroups.set(line, [])
    lineGroups.get(line).push(dep)
  }

  const result = []
  for (const deps of lineGroups.values()) {
    const next2 = deps.slice(0, 2)
    const subGroups = []
    for (const dep of next2) {
      const existing = subGroups.find(g => isSameDirection(direction(g.dep), direction(dep)))
      if (existing) existing.times.push(dep)
      else subGroups.push({ dep, times: [dep] })
    }
    result.push(...subGroups)
  }
  return result
})
</script>

<template>
  <div class="bg-white dark:bg-ios-dark-card rounded-2xl" style="box-shadow: 0 2px 12px rgba(0,0,0,0.07);">

    <!-- Header (klickbar) -->
    <div
      @click="onToggle()"
      class="px-4 pt-4 pb-3 flex items-center gap-3 cursor-pointer active:opacity-60 transition-opacity"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        class="text-ios-gray flex-shrink-0 transition-transform duration-200"
        :class="{ 'rotate-90': expanded }"
      >
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h2 class="font-bold text-ios-dark dark:text-white text-base leading-tight flex-1 min-w-0 truncate">{{ stop.stopName }}</h2>
      <span v-if="formatDistance(distanceKm)"
        class="text-[10px] font-medium text-ios-secondary dark:text-ios-dark-secondary flex-shrink-0">
        {{ formatDistance(distanceKm) }}
      </span>
    </div>

    <!-- Fehler -->
    <div v-if="error && !expanded" class="px-4 pb-4 text-sm text-red-500">{{ error }}</div>

    <!-- Skeleton -->
    <div v-else-if="loading && departures.length === 0 && !expanded" class="px-3 pb-3 flex flex-col gap-2">
      <div v-for="i in 2" :key="i" class="flex items-center px-2 py-2.5 gap-3 animate-pulse rounded-xl bg-gray-50 dark:bg-ios-dark-elevated">
        <div class="h-7 w-12 rounded-xl bg-gray-200 dark:bg-ios-dark-separator flex-shrink-0"></div>
        <div class="flex-1 h-4 rounded-lg bg-gray-200 dark:bg-ios-dark-separator" :style="{ maxWidth: i === 1 ? '55%' : '40%' }"></div>
        <div class="flex gap-2">
          <div class="h-7 w-14 rounded-full bg-gray-200 dark:bg-ios-dark-separator"></div>
        </div>
      </div>
    </div>

    <!-- Keine Abfahrten -->
    <div v-else-if="departures.length === 0 && !expanded" class="px-4 pb-4 text-sm text-ios-secondary">
      Keine passenden Abfahrten gefunden
    </div>

    <!-- Gruppierte Abfahrten (gefiltert) -->
    <div v-if="!expanded && departures.length > 0" class="px-3 pb-3 flex flex-col gap-1.5">
      <div
        v-for="(group, idx) in groupedDepartures"
        :key="idx"
        class="flex items-center px-2 py-2.5 gap-3 rounded-xl bg-gray-50 dark:bg-ios-dark-elevated"
      >
        <!-- Linienbadge -->
        <span
          class="text-sm font-bold px-3 py-1.5 rounded-xl min-w-[3.25rem] text-center flex-shrink-0 leading-none"
          :style="{ backgroundColor: getLineStyle(group.dep.servingLine).bg, color: getLineStyle(group.dep.servingLine).text }"
        >
          {{ lineName(group.dep) }}
        </span>

        <!-- Richtung -->
        <span class="flex-1 text-[13px] text-ios-secondary dark:text-gray-400 truncate">{{ direction(group.dep) }}</span>

        <!-- Zeitpillen -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span
            v-for="(dep, ti) in group.times.slice(0, 2)"
            :key="ti"
            class="text-[13px] font-bold tabular-nums px-2.5 py-1 rounded-full leading-none"
            :class="countdownPillClass(dep, ti > 0)"
          >
            {{ formatCountdown(dep) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Expandierter Bereich (alle Abfahrten) -->
    <div v-if="expanded" class="px-4 pb-4">
      <!-- Loading -->
      <div v-if="allDeparturesLoading && allDepartures.length === 0" class="flex flex-col gap-2">
        <div v-for="i in 5" :key="i" class="flex items-center px-2 py-2.5 gap-3 animate-pulse rounded-xl bg-gray-50 dark:bg-ios-dark-elevated">
          <div class="h-7 w-12 rounded-xl bg-gray-200 dark:bg-ios-dark-separator flex-shrink-0"></div>
          <div class="flex-1 h-4 rounded-lg bg-gray-200 dark:bg-ios-dark-separator" :style="{ maxWidth: i % 2 === 0 ? '55%' : '40%' }"></div>
          <div class="flex gap-2">
            <div class="h-7 w-14 rounded-full bg-gray-200 dark:bg-ios-dark-separator"></div>
          </div>
        </div>
      </div>

      <!-- Keine Abfahrten -->
      <div v-else-if="allDepartures.length === 0" class="text-sm text-ios-secondary">
        Keine Abfahrten gefunden
      </div>

      <!-- Alle Abfahrten (ungefiltert) -->
      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="dep in allDepartures"
          :key="dep.servingLine?.symbol + dep.servingLine?.direction + dep.dateTime?.minute"
          class="flex items-center px-2 py-2.5 gap-3 rounded-xl bg-gray-50 dark:bg-ios-dark-elevated"
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
