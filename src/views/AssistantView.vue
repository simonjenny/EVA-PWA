<script setup>
import { ref, nextTick, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAssistantStore } from '../stores/assistant.js'
import { sendMessage } from '../services/openrouter.js'
import { searchStops, getDepartures, planTrip, getDisruptions, findNearestStop } from '../services/efa.js'
import { getLineStyle } from '../utils/lineColors.js'
import { useSettingsStore } from '../stores/settings.js'

const router = useRouter()
const store = useAssistantStore()
const settingsStore = useSettingsStore()

const inputText = ref('')
const loading = ref(false)
const error = ref(null)
const messagesEl = ref(null)

const hasApiKey = computed(() => !!store.openrouterApiKey && !!store.openrouterModel)

const homeStop = settingsStore.homeStop
const homeStopHint = homeStop
  ? `Die Heimhaltestelle des Benutzers ist "${homeStop.stopName}" (Stop-ID: ${homeStop.stopId}). Wenn der Benutzer "nach Hause", "heimwärts" oder Ähnliches schreibt, verwende diese Stop-ID direkt ohne search_stops aufzurufen.`
  : 'Der Benutzer hat keine Heimhaltestelle konfiguriert.'

const SYSTEM_PROMPT = `Du bist ein ÖV-Assistent für das BVB-Netz Basel. Antworte immer auf Deutsch, kurz und direkt. Nutze Tools für aktuelle Daten – erfinde keine. Suche zuerst Haltestellen-IDs via search_stops. Liste max. 5 Abfahrten auf. Kein ausschweifendes Fazit. Keine nummerierten Listen – verwende einfache Aufzählungspunkte (- ). Bei Verbindungen: Schreibe nur einen kurzen einleitenden Satz (z.B. "Hier sind deine Möglichkeiten:" oder "Das habe ich gefunden:") – die Verbindungsdetails werden separat angezeigt, liste sie nicht auf. ${homeStopHint} Wenn der Benutzer "von hier", "von meinem Standort" schreibt oder keinen Startort angibt, rufe get_nearest_stop auf um die nächstgelegene Haltestelle zu ermitteln. Heute: ${new Date().toLocaleDateString('de-CH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}, ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} Uhr.`

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation nicht verfügbar')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error('Standort konnte nicht ermittelt werden – Zugriff verweigert')),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    )
  })
}

const EFA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_stops',
      description: 'Sucht nach Haltestellen anhand eines Namens im BVB-Netz Basel.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name der Haltestelle' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_departures',
      description: 'Gibt aktuelle Abfahrten an einer Haltestelle zurück. Erst search_stops aufrufen.',
      parameters: {
        type: 'object',
        properties: {
          stopId: { type: 'string', description: 'EFA-Haltestellennummer' }
        },
        required: ['stopId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_trip',
      description: 'Plant eine Reise zwischen zwei Haltestellen. Erst search_stops aufrufen.',
      parameters: {
        type: 'object',
        properties: {
          originId: { type: 'string', description: 'EFA-ID der Starthaltestelle' },
          destinationId: { type: 'string', description: 'EFA-ID der Zielhaltestelle' },
          dateTime: { type: 'string', description: 'ISO 8601 Datum/Zeit (z.B. 2024-01-15T14:30:00)' },
          depArr: { type: 'string', enum: ['dep', 'arr'], description: 'dep = Abfahrt, arr = Ankunft' }
        },
        required: ['originId', 'destinationId', 'dateTime', 'depArr']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_disruptions',
      description: 'Gibt aktuelle Störungen und Baustellen im BVB-Netz zurück.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_nearest_stop',
      description: 'Ermittelt den aktuellen GPS-Standort des Benutzers und gibt die nächstgelegene Haltestelle zurück. Verwende dieses Tool wenn der Benutzer "von hier", "von meinem Standort" schreibt oder keine Starthaltestelle nennt.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
]

// ── Trip-Hilfsfunktionen ───────────────────────────────────────────────────
function getLegs(trip) {
  const raw = trip?.legs
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (raw.leg) return Array.isArray(raw.leg) ? raw.leg : [raw.leg]
  return []
}

function getPoint(leg, first) {
  const pts = leg.points
  if (Array.isArray(pts)) return first ? pts[0] : pts[pts.length - 1]
  return pts
}

function getTripSummary(trip) {
  const legs = getLegs(trip)
  if (!legs.length) return null

  const firstPoint = getPoint(legs[0], true)
  const lastPoint = getPoint(legs[legs.length - 1], false)
  const depDt = firstPoint?.dateTime
  const arrDt = lastPoint?.dateTime
  const depTime = depDt?.time?.substring(0, 5) || '–'
  const arrTime = arrDt?.time?.substring(0, 5) || '–'
  const origin = firstPoint?.name || ''
  const destination = lastPoint?.name || ''

  const [h, m] = (trip.duration || '0:0').split(':').map(Number)
  const duration = h > 0 ? `${h} h ${m > 0 ? m + ' min' : ''}`.trim() : `${m} min`

  const transitLegs = legs.filter(l => {
    const t = parseInt(l.mode?.type ?? '99')
    return t !== 99 && t !== 100
  })
  const lines = transitLegs.map(l => ({ number: l.mode?.number || l.mode?.symbol || '', motType: parseInt(l.mode?.type ?? '5') })).filter(l => l.number)
  const changes = Math.max(0, transitLegs.length - 1)

  return { depTime, arrTime, origin, destination, duration, lines, changes }
}

function openTripDetail(trip) {
  router.push({
    path: '/trip/detail',
    query: { data: encodeURIComponent(JSON.stringify(trip)) }
  })
}

// ── Tool execution ─────────────────────────────────────────────────────────
let pendingTrips = []

async function executeTool(name, args) {
  if (name === 'search_stops') return await searchStops(args.query)
  if (name === 'get_departures') return await getDepartures(args.stopId)
  if (name === 'plan_trip') {
    const results = await planTrip(args.originId, args.destinationId, new Date(args.dateTime), args.depArr || 'dep')
    pendingTrips = results.slice(0, 5)
    return results
  }
  if (name === 'get_disruptions') return await getDisruptions()
  if (name === 'get_nearest_stop') {
    const { lat, lon } = await getCurrentPosition()
    const stop = await findNearestStop(lat, lon)
    if (!stop) throw new Error('Keine Haltestelle in der Nähe gefunden.')
    return stop
  }
  throw new Error(`Unbekanntes Tool: ${name}`)
}

// ── Markdown → HTML ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ''

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code style="background:rgba(128,128,128,0.2);padding:0 3px;border-radius:3px;font-size:0.82em;font-family:monospace">$1</code>')

  const parseRow = row => {
    const parts = row.split('|')
    if (parts[0].trim() === '') parts.shift()
    if (parts.length && parts[parts.length - 1].trim() === '') parts.pop()
    return parts.map(c => c.trim())
  }
  const isSeparator = row => !row.replace(/[|\-: ]/g, '').trim()

  const lines = text.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { out.push('<div style="height:6px"></div>'); i++; continue }

    const hMatch = line.match(/^(#{1,3}) (.+)/)
    if (hMatch) { out.push(`<p style="font-weight:700;margin-top:6px;margin-bottom:2px">${inline(esc(hMatch[2]))}</p>`); i++; continue }

    if (/^-{3,}$/.test(line.trim())) { out.push('<hr style="border:none;border-top:1px solid rgba(128,128,128,0.3);margin:6px 0">'); i++; continue }

    if (line.trim().startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++ }
      const nonSep = tableLines.filter(l => !isSeparator(l))
      if (!nonSep.length) continue
      const [headerRow, ...dataRows] = nonSep
      const headers = parseRow(headerRow)
      let t = '<div style="overflow-x:auto;margin:6px 0;border-radius:8px;border:1px solid rgba(128,128,128,0.2)"><table style="width:100%;border-collapse:collapse;font-size:0.78rem"><thead><tr style="background:rgba(128,128,128,0.1)">'
      t += headers.map(h => `<th style="text-align:left;padding:5px 10px;font-weight:600;white-space:nowrap">${inline(esc(h))}</th>`).join('')
      t += '</tr></thead><tbody>'
      t += dataRows.map((row, ri) => {
        const cells = parseRow(row)
        const bg = ri % 2 ? 'background:rgba(128,128,128,0.05)' : ''
        const border = ri < dataRows.length - 1 ? 'border-bottom:1px solid rgba(128,128,128,0.15)' : ''
        return `<tr style="${bg};${border}">${cells.map(c => `<td style="padding:4px 10px;vertical-align:top">${inline(esc(c))}</td>`).join('')}</tr>`
      }).join('')
      t += '</tbody></table></div>'
      out.push(t); continue
    }

    const bulletMatch = line.match(/^[-*•] (.+)/)
    if (bulletMatch) { out.push(`<div style="display:flex;gap:5px;align-items:flex-start;margin:1px 0"><span style="flex-shrink:0;margin-top:1px">•</span><span>${inline(esc(bulletMatch[1]))}</span></div>`); i++; continue }

    const numMatch = line.match(/^(\d+)\. (.+)/)
    if (numMatch) { out.push(`<div style="display:flex;gap:5px;align-items:flex-start;margin:1px 0"><span style="flex-shrink:0;margin-top:1px">•</span><span>${inline(esc(numMatch[2]))}</span></div>`); i++; continue }

    out.push(`<p style="margin:1px 0">${inline(esc(line))}</p>`)
    i++
  }

  return out.join('')
}

// ── Chat logic ─────────────────────────────────────────────────────────────
async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

async function send() {
  const text = inputText.value.trim()
  if (!text || loading.value || !hasApiKey.value) return

  inputText.value = ''
  error.value = null
  pendingTrips = []
  store.addMessage({ role: 'user', content: text })
  loading.value = true
  await scrollToBottom()

  try {
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...store.chatHistory.map(m => ({ role: m.role, content: m.content }))
    ]

    let choice = await sendMessage(store.openrouterApiKey, store.openrouterModel, apiMessages, EFA_TOOLS)

    let iterations = 0
    while (choice?.finish_reason === 'tool_calls' && choice.message?.tool_calls?.length && iterations < 5) {
      iterations++
      apiMessages.push(choice.message)
      for (const tc of choice.message.tool_calls) {
        let result
        try {
          result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'))
        } catch (e) {
          result = { error: e.message }
        }
        apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
      choice = await sendMessage(store.openrouterApiKey, store.openrouterModel, apiMessages, EFA_TOOLS)
    }

    const assistantText = choice?.message?.content || ''
    if (assistantText) {
      store.addMessage({
        role: 'assistant',
        content: assistantText,
        trips: pendingTrips.length ? [...pendingTrips] : undefined
      })
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
    pendingTrips = []
    await scrollToBottom()
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

onMounted(scrollToBottom)
</script>

<template>
  <div class="flex flex-col bg-ios-secondary dark:bg-ios-dark" style="height: calc(100dvh - 70px);">

    <!-- Unified scroll container: header + content scroll together -->
    <div ref="messagesEl" class="flex-1 overflow-y-auto">

      <!-- Header -->
      <div class="px-4" style="padding-top: calc(env(safe-area-inset-top, 0px) + 16px); padding-bottom: 16px;">
        <h1 class="text-3xl font-bold text-ios-dark dark:text-white tracking-tight">ÖV-Assistent</h1>
      </div>

      <!-- Kein API Key -->
      <div v-if="!hasApiKey" class="flex flex-col items-center justify-center px-6 text-center gap-4 py-20">
        <div class="w-16 h-16 rounded-full bg-ios-blue/10 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="text-ios-blue">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <p class="text-gray-900 dark:text-white font-medium text-lg">API Key fehlt</p>
          <p class="text-ios-gray text-sm mt-1">Bitte OpenRouter API Key und Modell in den Einstellungen konfigurieren.</p>
        </div>
        <button @click="router.push('/settings')" class="bg-ios-blue text-white px-6 py-2.5 rounded-full font-medium active:opacity-80">
          Zu den Einstellungen
        </button>
      </div>

      <!-- Chat -->
      <div v-else class="px-4 py-2 space-y-3">

        <div v-if="store.chatHistory.length === 0" class="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div class="w-14 h-14 rounded-full bg-ios-blue/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="text-ios-blue">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>
            </svg>
          </div>
          <p class="text-ios-gray text-sm">Abfahrten, Verbindungen oder Störungen im BVB-Netz.</p>
        </div>

        <div v-for="(msg, i) in store.chatHistory" :key="i" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
          <!-- User -->
          <div
            v-if="msg.role === 'user'"
            class="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ios-blue text-white text-sm leading-relaxed"
            style="white-space: pre-wrap; word-break: break-word;"
          >{{ msg.content }}</div>

          <!-- Assistent -->
          <div v-else class="max-w-[90%] flex flex-col gap-2 items-start">
            <div
              class="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-ios-dark-card text-gray-900 dark:text-white text-sm leading-relaxed shadow-sm w-full"
              v-html="renderMarkdown(msg.content)"
            />

            <!-- Verbindungskarten -->
            <template v-if="msg.trips?.length">
              <button
                v-for="(trip, ti) in msg.trips"
                :key="ti"
                @click="openTripDetail(trip)"
                class="w-full bg-white dark:bg-ios-dark-card rounded-2xl px-4 py-3 shadow-sm active:opacity-60 text-left flex items-center gap-3"
              >
                <div class="flex-1 min-w-0">
                  <!-- Start → Ziel -->
                  <div class="flex items-center gap-1.5 mb-2 text-xs text-ios-gray font-medium truncate">
                    <span class="truncate">{{ getTripSummary(trip)?.origin }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="flex-shrink-0">
                      <path d="M5 12h14M14 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="truncate">{{ getTripSummary(trip)?.destination }}</span>
                  </div>
                  <!-- Zeit + Dauer -->
                  <div class="flex items-baseline gap-2 mb-2">
                    <span class="text-base font-semibold text-ios-dark dark:text-white tabular-nums">
                      {{ getTripSummary(trip)?.depTime }}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-ios-gray flex-shrink-0">
                      <path d="M5 12h14M14 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="text-base font-semibold text-ios-dark dark:text-white tabular-nums">
                      {{ getTripSummary(trip)?.arrTime }}
                    </span>
                    <span class="text-xs text-ios-gray">{{ getTripSummary(trip)?.duration }}</span>
                    <span v-if="getTripSummary(trip)?.changes > 0" class="text-xs text-ios-gray">· {{ getTripSummary(trip)?.changes }}×</span>
                  </div>
                  <!-- Linien-Badges -->
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(line, li) in getTripSummary(trip)?.lines"
                      :key="li"
                      class="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                      :style="{ backgroundColor: getLineStyle(line).bg, color: getLineStyle(line).text }"
                    >{{ line.number }}</span>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ios-gray flex-shrink-0">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </template>
          </div>
        </div>

        <div v-if="loading" class="flex justify-start">
          <div class="bg-white dark:bg-ios-dark-card px-4 py-3 rounded-2xl rounded-bl-md shadow-sm flex gap-1.5 items-center">
            <span class="w-2 h-2 rounded-full bg-ios-gray animate-bounce" style="animation-delay:0ms"></span>
            <span class="w-2 h-2 rounded-full bg-ios-gray animate-bounce" style="animation-delay:150ms"></span>
            <span class="w-2 h-2 rounded-full bg-ios-gray animate-bounce" style="animation-delay:300ms"></span>
          </div>
        </div>

        <div v-if="error" class="flex justify-start">
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm text-red-600 dark:text-red-400 max-w-[88%]">
            {{ error }}
          </div>
        </div>
      </div>

    </div>

    <!-- Eingabe -->
    <div v-if="hasApiKey" class="bg-white dark:bg-ios-dark-card border-t border-ios-separator dark:border-ios-dark-separator px-3 py-2 flex gap-2 items-end">
      <textarea
        v-model="inputText"
        @keydown="onKeydown"
        :disabled="loading"
        placeholder="Nachricht eingeben…"
        rows="1"
        class="flex-1 bg-ios-secondary dark:bg-ios-dark rounded-2xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-ios-gray resize-none outline-none leading-relaxed disabled:opacity-50"
        style="max-height:120px;overflow-y:auto;"
        @input="e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }"
      />
      <button
        @click="send"
        :disabled="!inputText.trim() || loading"
        class="w-9 h-9 rounded-full bg-ios-blue flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40 active:opacity-70 mb-0.5"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-white -rotate-90">
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" fill="currentColor"/>
        </svg>
      </button>
    </div>

  </div>
</template>
