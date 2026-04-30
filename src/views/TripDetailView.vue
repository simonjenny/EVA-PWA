<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLineStyle } from '../utils/lineColors.js'

const route = useRoute()
const router = useRouter()

// Trip wird als JSON-String via Query-Parameter übergeben
const trip = computed(() => {
  try {
    return JSON.parse(decodeURIComponent(route.query.data || ''))
  } catch {
    return null
  }
})

function getLegs(trip) {
  const raw = trip?.legs
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (raw.leg) return Array.isArray(raw.leg) ? raw.leg : [raw.leg]
  return []
}

function getLegDep(leg) {
  const pts = leg.points
  return Array.isArray(pts) ? pts[0] : pts
}

function getLegArr(leg) {
  const pts = leg.points
  return Array.isArray(pts) ? pts[pts.length - 1] : pts
}

function formatTime(dt) {
  if (!dt?.time) return '–'
  return dt.time.substring(0, 5)
}

function formatDate(dt) {
  if (!dt?.date) return ''
  return dt.date
}

function formatDuration(trip) {
  if (!trip?.duration) return null
  const [h, m] = trip.duration.split(':').map(Number)
  const total = h * 60 + m
  if (total < 60) return `${total} Min.`
  return `${h} Std. ${m > 0 ? m + ' Min.' : ''}`
}

function getLegMode(leg) {
  // Echte EFA-BVB Werte: type=3=Bus, type=4=Tram, type=6=Zug, type=99/100=Fussweg
  const t = leg.mode?.type
  if (!t) return 'walk'
  const m = parseInt(t)
  if (m === 99 || m === 100) return 'walk'
  if (m === 1) return 'train'
  if (m === 2) return 'suburban'
  if (m === 3) return 'bus'
  if (m === 4) return 'tram'
  if (m === 5) return 'bus'
  if (m === 6) return 'train'
  if (m === 7) return 'bus'
  return 'transit'
}

function getLegModeLabel(leg) {
  const t = leg.mode?.type
  if (!t) return 'Fussweg'
  const m = parseInt(t)
  if (m === 99 || m === 100) return 'Fussweg'
  if (m === 1) return leg.mode?.trainType || 'Zug'
  if (m === 2) return 'S-Bahn'
  if (m === 3) return 'Bus'
  if (m === 4) return 'Tram'
  if (m === 5) return 'Bus'
  if (m === 6) return leg.mode?.trainType || 'Zug'
  if (m === 7) return 'Bus'
  return 'Linie'
}

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

function getLegWalkMinutes(leg) {
  return leg.timeMinute ? `${leg.timeMinute} Min.` : ''
}

function getLegLine(leg) {
  return leg.mode?.number || leg.mode?.name || null
}

function getLegDirection(leg) {
  return leg.mode?.destination || null
}

function decodeHtml(str) {
  return (str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function getLegDisruptions(leg) {
  const result = []
  // leg.infos kann ein Array sein ODER { info: [...] }
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
      result.push({ title, text: decodeHtml(rawText) })
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

function getIntermediateStops(leg) {
  const seq = leg.stopSeq
  if (!seq) return []
  let stops = Array.isArray(seq) ? seq : (seq.point ? (Array.isArray(seq.point) ? seq.point : [seq.point]) : [])
  return stops.length > 2 ? stops.slice(1, -1) : []
}

const expandedLegs = ref(new Set())
const expandedDisruptions = ref(new Set())

function toggleDisruption(key) {
  const s = new Set(expandedDisruptions.value)
  s.has(key) ? s.delete(key) : s.add(key)
  expandedDisruptions.value = s
}

function toggleStops(idx) {
  const s = new Set(expandedLegs.value)
  s.has(idx) ? s.delete(idx) : s.add(idx)
  expandedLegs.value = s
}

const legs = computed(() => trip.value ? getLegs(trip.value) : [])

onMounted(() => nextTick(() => window.scrollTo({ top: 0, behavior: 'instant' })))
</script>

<template>
  <div class="min-h-screen bg-ios-bg dark:bg-ios-dark-bg pb-24">
    <!-- Header -->
    <div
      class="sticky top-0 z-20 bg-white dark:bg-ios-dark-card border-b border-ios-separator dark:border-ios-dark-separator px-4 pb-4"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 16px);"
    >
      <div class="flex items-center gap-3 mb-1">
        <button
          @click="router.back()"
          class="text-ios-blue flex items-center gap-1 active:opacity-50 transition-opacity -ml-1"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="text-[17px]">Reiseplaner</span>
        </button>
      </div>
      <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight">Reisedetails</h1>

      <!-- Zusammenfassung -->
      <div v-if="trip" class="mt-3 flex items-center gap-3 text-ios-secondary text-[14px]">
        <span class="font-semibold text-ios-label dark:text-white text-[18px]">
          {{ formatTime(getLegDep(legs[0])?.dateTime) }}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="flex-shrink-0">
          <path d="M5 12h14M14 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="font-semibold text-ios-label dark:text-white text-[18px]">
          {{ formatTime(getLegArr(legs[legs.length - 1])?.dateTime) }}
        </span>
        <span class="mx-1">·</span>
        <span>{{ formatDuration(trip) }}</span>
        <span class="mx-1">·</span>
        <span>{{ trip.interchange === '0' || trip.interchange === 0 ? 'Direkt' : trip.interchange + ' Umstieg' + (parseInt(trip.interchange) > 1 ? 'e' : '') }}</span>
      </div>
    </div>

    <!-- Kein Trip -->
    <div v-if="!trip" class="text-center text-ios-secondary py-16">
      <p>Keine Reisedaten verfügbar.</p>
      <button @click="router.back()" class="mt-4 text-ios-blue">Zurück</button>
    </div>

    <!-- Leg-Timeline: [Zeit w-12] [Punkt+Linie w-6] [Inhalt flex-1] -->
    <div v-else class="px-4 pt-5 pb-6">
      <template v-for="(leg, idx) in legs" :key="idx">

        <!-- ── Fussweg ── -->
        <div v-if="isWalkLeg(leg)" class="flex items-stretch">
          <div class="w-12 flex-shrink-0"></div>
          <div class="w-6 flex-shrink-0 flex flex-col items-center">
            <div class="flex-1 border-l-2 border-dashed border-ios-separator dark:border-ios-dark-separator" style="min-height:48px"></div>
          </div>
          <div class="flex-1 flex items-center gap-2 pl-3 py-3 text-ios-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="flex-shrink-0">
              <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2V23h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
            </svg>
            <span class="text-[14px]">Fussweg {{ getLegWalkMinutes(leg) }}</span>
          </div>
        </div>

        <!-- ── Transit-Leg ── -->
        <template v-else>

          <!-- Abfahrt-Haltestelle -->
          <div class="flex items-start">
            <div class="w-12 flex-shrink-0 text-right pr-3 -mt-1">
              <span
                class="text-[15px] font-bold tabular-nums"
                style="line-height: 1.2rem; display: inline-block;"
                :class="idx > 0 && !isWalkLeg(legs[idx-1]) ? 'text-ios-secondary' : 'text-ios-label dark:text-white'"
              >{{ formatTime(getLegDep(leg)?.dateTime) }}</span>
            </div>
            <div class="w-6 flex-shrink-0 flex flex-col items-center">
              <div class="w-3 h-3 rounded-full flex-shrink-0" style="margin-top: 3px;" :style="{ backgroundColor: getLegColor(leg) }"></div>
              <div class="w-px flex-1 mt-1" :style="{ backgroundColor: getLegColor(leg), minHeight: '16px' }"></div>
            </div>
            <div class="flex-1 pl-3 pb-2">
              <template v-if="idx === 0 || isWalkLeg(legs[idx-1])">
                <div class="text-[16px] font-semibold text-ios-label dark:text-white leading-snug">{{ getLegDep(leg)?.name }}</div>
                <div v-if="getLegDep(leg)?.platformName" class="text-[12px] text-ios-secondary mt-0.5">Gleis/Steig {{ getLegDep(leg).platformName }}</div>
              </template>
              <template v-else>
                <div class="text-[14px] text-ios-secondary leading-snug">Abfahrt</div>
              </template>
            </div>
          </div>

          <!-- Linien-Info -->
          <div class="flex items-start">
            <div class="w-12 flex-shrink-0"></div>
            <div class="w-6 flex-shrink-0 flex flex-col items-center">
              <div class="w-px flex-1" :style="{ backgroundColor: getLegColor(leg), minHeight: '16px' }"></div>
            </div>
            <div class="flex-1 pl-3 py-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="text-[13px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                  :style="{ backgroundColor: getLegStyle(leg).bg, color: getLegStyle(leg).text }"
                >{{ getLegLine(leg) }}</span>
                <span class="text-[14px] font-semibold text-ios-label dark:text-white">{{ getLegModeLabel(leg) }}</span>
                <span v-if="getLegDirection(leg)" class="text-[13px] text-ios-secondary">→ {{ getLegDirection(leg) }}</span>
              </div>
              <!-- Störungsmeldungen -->
              <button
                v-for="(disruption, di) in getLegDisruptions(leg)"
                :key="di"
                @click="toggleDisruption(`${idx}-${di}`)"
                class="mt-2 w-full text-left flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 active:opacity-70 transition-opacity"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="text-yellow-500 flex-shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[13px] font-semibold text-yellow-600 dark:text-yellow-400 leading-snug">{{ disruption.title }}</span>
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      :class="expandedDisruptions.has(`${idx}-${di}`) ? 'rotate-180' : ''"
                      class="text-yellow-500 flex-shrink-0 transition-transform duration-200"
                    >
                      <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <div v-if="disruption.text && expandedDisruptions.has(`${idx}-${di}`)" class="text-[12px] text-ios-secondary mt-1 leading-snug">{{ disruption.text }}</div>
                </div>
              </button>
              <button
                v-if="getIntermediateStops(leg).length"
                @click="toggleStops(idx)"
                class="mt-2 flex items-center gap-1.5 text-ios-blue text-[13px] active:opacity-50 transition-opacity"
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  :class="expandedLegs.has(idx) ? 'rotate-180' : ''"
                  class="transition-transform duration-200 flex-shrink-0"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ expandedLegs.has(idx) ? 'Ausblenden' : getIntermediateStops(leg).length + ' Zwischenstationen' }}
              </button>
            </div>
          </div>

          <!-- Zwischenstationen (ausgeklappt) -->
          <template v-if="expandedLegs.has(idx)">
            <div v-for="(stop, si) in getIntermediateStops(leg)" :key="si" class="flex items-start">
              <div class="w-12 flex-shrink-0 text-right pr-3" style="padding-top:5px">
                <span class="text-[12px] tabular-nums text-ios-secondary">{{ stop.dateTime?.time?.substring(0, 5) ?? '' }}</span>
              </div>
              <div class="w-6 flex-shrink-0 flex flex-col items-center">
                <div class="w-px" :style="{ backgroundColor: getLegColor(leg), height: '7px' }"></div>
                <div class="w-2 h-2 rounded-full border-2 flex-shrink-0" :style="{ borderColor: getLegColor(leg) }"></div>
                <div class="w-px flex-1" :style="{ backgroundColor: getLegColor(leg), minHeight: '7px' }"></div>
              </div>
              <div class="flex-1 pl-3 py-0.5">
                <span class="text-[14px] text-ios-secondary">{{ stop.name }}</span>
              </div>
            </div>
            <!-- Abstand nach letzter Zwischenstation -->
            <div class="flex">
              <div class="w-12 flex-shrink-0"></div>
              <div class="w-6 flex-shrink-0 flex justify-center">
                <div class="w-px" :style="{ backgroundColor: getLegColor(leg), height: '5px' }"></div>
              </div>
            </div>
          </template>

          <!-- Ankunft-Haltestelle -->
          <div class="flex items-start">
            <div class="w-12 flex-shrink-0 text-right pr-3">
              <span class="text-[15px] font-bold tabular-nums text-ios-label dark:text-white" style="line-height: 1.2rem; display: inline-block; padding-top: 2px;">{{ formatTime(getLegArr(leg)?.dateTime) }}</span>
            </div>
            <div class="w-6 flex-shrink-0 flex flex-col items-center">
              <div class="w-px flex-shrink-0" :style="{ backgroundColor: getLegColor(leg), height: '5px' }"></div>
              <div class="w-3 h-3 rounded-full flex-shrink-0" :style="{ backgroundColor: getLegColor(leg) }"></div>
              <div
                v-if="idx < legs.length - 1"
                class="w-px flex-1 mt-1 bg-ios-separator dark:bg-ios-dark-separator"
                style="min-height: 20px"
              ></div>
            </div>
            <div class="flex-1 pl-3 pb-3">
              <div class="text-[16px] font-semibold text-ios-label dark:text-white leading-snug">{{ getLegArr(leg)?.name }}</div>
              <div v-if="getLegArr(leg)?.platformName" class="text-[12px] text-ios-secondary mt-0.5">Gleis/Steig {{ getLegArr(leg).platformName }}</div>
              <!-- Umstieg-Hinweis wenn nächstes Leg auch ein Transit-Leg ist -->
              <div
                v-if="idx < legs.length - 1 && !isWalkLeg(legs[idx + 1])"
                class="text-[12px] text-ios-secondary mt-1"
              >Umstieg · Abfahrt {{ formatTime(getLegDep(legs[idx + 1])?.dateTime) }}</div>
            </div>
          </div>

        </template>
      </template>
    </div>
  </div>
</template>

