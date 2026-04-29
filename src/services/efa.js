const BASE_URL = 'https://www.efa-bw.de/bvb3'

/**
 * Normalisiert EFA-Antworten: Einzelobjekt oder Array → immer Array
 */
function ensureArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

// EFA gibt bei 1 Treffer { point: {...} } zurück, bei mehreren [{...}, ...]
// Diese Funktion normalisiert immer zu einem flachen Array von Stop-Objekten
function normalizePoints(points) {
  if (!points) return []
  // Einzeltreffer: { point: { anyType, ref, ... } }
  if (points.point) return ensureArray(points.point)
  return ensureArray(points)
}

/**
 * Löst Koordinaten für eine bekannte stopId auf.
 * Gibt { lat, lon } oder null zurück.
 */
export async function resolveStopCoords(stopId) {
  const params = new URLSearchParams({
    outputFormat: 'JSON',
    type_dm: 'stop',
    name_dm: stopId,
    mode: 'direct',
    limit: '1',
    coordOutputFormat: 'WGS84[DD.DDDDD]'
  })
  try {
    const res = await fetch(`https://www.efa-bw.de/bvb3/XML_DM_REQUEST?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const coord = data.dm?.points?.point?.ref?.coords || ''
    const [lonStr, latStr] = typeof coord === 'string' ? coord.split(',') : []
    const lat = latStr ? parseFloat(latStr) : null
    const lon = lonStr ? parseFloat(lonStr) : null
    if (lat && lon && !isNaN(lat) && !isNaN(lon)) return { lat, lon }
  } catch { /* ignorieren */ }
  return null
}

/**
 * Findet die nächstgelegene Haltestelle zu Koordinaten via XML_COORD_REQUEST
 */
export async function findNearestStop(lat, lon) {
  const params = new URLSearchParams({
    outputFormat: 'JSON',
    coord: `${lon.toFixed(6)}:${lat.toFixed(6)}:WGS84`,
    coordOutputFormat: 'WGS84[DD.DDDDD]',
    type_1: 'STOP',
    radius_1: '1000',
    max_1: '5',
    inclFilter: '1'
  })

  const res = await fetch(`https://www.efa-bw.de/bvb3/XML_COORD_REQUEST?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const pins = ensureArray(data.pins)
  const stop = pins.find(p => p.type === 'STOP')
  if (!stop) return null

  const attrs = Object.fromEntries(
    ensureArray(stop.attrs).map(a => [a.name, a.value])
  )
  const fullName = attrs['STOP_NAME_WITH_PLACE'] || `${stop.locality ? stop.locality + ', ' : ''}${stop.desc}`

  // coords = "lon,lat"
  const [lonStr, latStr] = typeof stop.coords === 'string' ? stop.coords.split(',') : []
  return {
    id: stop.stateless || stop.id,
    name: fullName,
    place: stop.locality || '',
    lat: latStr ? parseFloat(latStr) : null,
    lon: lonStr ? parseFloat(lonStr) : null
  }
}

/**
 * Sucht Haltestellen über XSLT_STOPFINDER_REQUEST
 */
export async function searchStops(query) {
  if (!query || query.trim().length < 2) return []

  const params = new URLSearchParams({
    outputFormat: 'JSON',
    type_sf: 'any',
    name_sf: query.trim(),
    coordOutputFormat: 'WGS84[DD.DDDDD]',
    anyObjFilter_sf: '2',
    locationServerActive: '1'
  })

  const res = await fetch(`https://www.efa-bw.de/bvb3/XSLT_STOPFINDER_REQUEST?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const points = normalizePoints(data.stopFinder?.points)

  return points
    .filter(p => p.anyType === 'stop')
    .map(p => {
      const coord = p.ref?.coords || p.coords || ''
      const [lonStr, latStr] = typeof coord === 'string' ? coord.split(',') : []
      const lat = latStr ? parseFloat(latStr) : null
      const lon = lonStr ? parseFloat(lonStr) : null
      return {
        id: p.ref?.id || p.stateless,
        name: p.name,
        place: p.mainLoc || p.ref?.place || '',
        lat: lat && !isNaN(lat) ? lat : null,
        lon: lon && !isNaN(lon) ? lon : null
      }
    })
}

/**
 * Plant eine Reise via XSLT_TRIP_REQUEST2
 * @param {string} originId - Stop-ID (ref.id) der Starthaltestelle
 * @param {string} destinationId - Stop-ID (ref.id) der Zielhaltestelle
 * @param {Date} dateTime - Datum und Uhrzeit
 * @param {'dep'|'arr'} depArr - 'dep' = Abfahrt, 'arr' = Ankunft
 * @returns {Promise<Array>} - Array von Trip-Verbindungen
 */
export async function planTrip(originId, destinationId, dateTime, depArr = 'dep') {
  const pad = n => String(n).padStart(2, '0')
  const dateStr = `${dateTime.getFullYear()}${pad(dateTime.getMonth() + 1)}${pad(dateTime.getDate())}`
  const timeStr = `${pad(dateTime.getHours())}${pad(dateTime.getMinutes())}`

  const params = new URLSearchParams({
    outputFormat: 'JSON',
    language: 'de',
    sessionID: '0',
    type_origin: 'stop',
    name_origin: originId,
    type_destination: 'stop',
    name_destination: destinationId,
    itdDate: dateStr,
    itdTime: timeStr,
    itdTripDateTimeDepArr: depArr
  })

  const res = await fetch(`${BASE_URL}/XSLT_TRIP_REQUEST2?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const trips = data.trips
  if (!trips) return []
  return Array.isArray(trips) ? trips : [trips]
}

/**
 * Lädt Abfahrten für eine Haltestelle via XML_DM_REQUEST
 */
export async function getDepartures(stopId) {
  const params = new URLSearchParams({
    outputFormat: 'JSON',
    type_dm: 'stop',
    name_dm: stopId,
    mode: 'direct',
    useRealtime: '1',
    lsShowTrainsExplicit: '1',
    useAllStops: '0',
    limit: '40',
    coordOutputFormat: 'WGS84[DD.DDDDD]'
  })

  const res = await fetch(`https://www.efa-bw.de/bvb3/XML_DM_REQUEST?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  return ensureArray(data.departureList)
}

/**
 * Berechnet Minuten bis zur Abfahrt (negativ = bereits abgefahren)
 * Nutzt den `countdown`-Wert aus EFA und korrigiert ihn um die Zeit seit dem Fetch.
 */
export function getCountdownMinutes(departure, fetchedAt) {
  const rawCountdown = departure.countdown !== undefined
    ? parseInt(departure.countdown, 10)
    : null

  if (rawCountdown !== null && fetchedAt) {
    const elapsedMinutes = Math.floor((Date.now() - fetchedAt) / 60000)
    return rawCountdown - elapsedMinutes
  }

  if (rawCountdown !== null) return rawCountdown

  // Fallback: aus Abfahrtszeit berechnen
  const dt = departure.realDateTime || departure.dateTime
  if (!dt) return null

  const depDate = new Date(
    parseInt(dt.year, 10),
    parseInt(dt.month, 10) - 1,
    parseInt(dt.day, 10),
    parseInt(dt.hour, 10),
    parseInt(dt.minute, 10)
  )
  return Math.floor((depDate.getTime() - Date.now()) / 60000)
}

/**
 * Lädt alle verfügbaren Linien + Richtungen für eine Haltestelle.
 * Gibt sortierte, deduplizierte Objekte zurück: { line, direction, motType }
 */
export async function getAvailableLines(stopId) {
  const params = new URLSearchParams({
    outputFormat: 'JSON',
    type_dm: 'stop',
    name_dm: stopId,
    mode: 'direct',
    useRealtime: '0',
    lsShowTrainsExplicit: '1',
    useAllStops: '0',
    limit: '80',
    coordOutputFormat: 'WGS84[DD.DDDDD]'
  })

  const res = await fetch(`https://www.efa-bw.de/bvb3/XML_DM_REQUEST?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const deps = ensureArray(data.departureList)

  const seen = new Set()
  const lines = []

  for (const dep of deps) {
    const sl = dep.servingLine
    if (!sl) continue
    const line = sl.number || sl.symbol || ''
    const direction = sl.direction || ''
    const motType = parseInt(sl.motType ?? '5', 10)
    const key = `${line}||${direction}`
    if (!seen.has(key)) {
      seen.add(key)
      lines.push({ line, direction, motType })
    }
  }

  // Sortieren: erst nach Linie (alphanumerisch), dann Richtung
  lines.sort((a, b) => {
    const la = a.line.toLowerCase()
    const lb = b.line.toLowerCase()
    if (la !== lb) return la.localeCompare(lb, 'de', { numeric: true })
    return a.direction.localeCompare(b.direction, 'de')
  })

  return lines
}

/**
 * Filtert Abfahrten nach konfigurierten Linien/Richtungen.
 * Leeres filters-Array = keine Filterung.
 */
export function filterDepartures(departures, filters) {
  if (!filters || filters.length === 0) return departures

  return departures.filter(dep => {
    const lineName = (dep.servingLine?.number || dep.servingLine?.symbol || '').toLowerCase()
    const direction = (dep.servingLine?.direction || '').toLowerCase()

    return filters.some(f => {
      const lineMatch = !f.line || lineName.includes(f.line.toLowerCase().trim())
      const dirMatch = !f.direction || direction.includes(f.direction.toLowerCase().trim())
      return lineMatch && dirMatch
    })
  })
}
