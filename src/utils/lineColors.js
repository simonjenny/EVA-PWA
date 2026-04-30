/**
 * Gibt Hintergrundfarbe und Textfarbe für einen Linien-Badge zurück,
 * basierend auf motType oder Linienpräfix.
 */

// BVB/BLT Linienfarben: Tram (1–21) und Bus (30–50), konfigurierbar
const bvbLineColors = {
  '1':  { bg: '#633000', text: '#fff' },
  '2':  { bg: '#993300', text: '#fff' },
  '3':  { bg: '#663399', text: '#fff' },
  '6':  { bg: '#0000CC', text: '#fff' },
  '8':  { bg: '#CC00FF', text: '#fff' },
  '10': { bg: '#FFFF00', text: '#000' },
  '11': { bg: '#FF0000', text: '#fff' },
  '12': { bg: '#800080', text: '#fff' },
  '14': { bg: '#FF6600', text: '#fff' },
  '15': { bg: '#006600', text: '#fff' },
  '16': { bg: '#00CC00', text: '#fff' },
  '17': { bg: '#0000FF', text: '#fff' },
  '21': { bg: '#99CCFF', text: '#000' },
  '30': { bg: '#808080', text: '#fff' },
  '31': { bg: '#808080', text: '#fff' },
  '32': { bg: '#808080', text: '#fff' },
  '33': { bg: '#808080', text: '#fff' },
  '34': { bg: '#808080', text: '#fff' },
  '35': { bg: '#808080', text: '#fff' },
  '36': { bg: '#808080', text: '#fff' },
  '38': { bg: '#808080', text: '#fff' },
  '42': { bg: '#808080', text: '#fff' },
  '45': { bg: '#808080', text: '#fff' },
  '46': { bg: '#808080', text: '#fff' },
  '48': { bg: '#808080', text: '#fff' },
  '50': { bg: '#808080', text: '#fff' },
}

export function getLineStyle(servingLine) {
  if (!servingLine) return { bg: '#6366F1', text: '#fff' }

  const number = servingLine.number || servingLine.symbol || ''
  const motType = parseInt(servingLine.motType ?? '5', 10)

  // BVB/BLT Linie (hat höchste Priorität)
  if (bvbLineColors[number]) return bvbLineColors[number]

  // Erkennung nach Linienpräfix (hat Vorrang)
  if (/^S\d/i.test(number)) return { bg: '#00963A', text: '#fff' }    // S-Bahn
  if (/^U\d/i.test(number)) return { bg: '#1C5FAD', text: '#fff' }    // U-Bahn
  if (/^STR/i.test(number) || /^T\d/i.test(number)) return { bg: '#E5001A', text: '#fff' }  // Tram

  // Fallback nach motType
  const motColors = {
    0: { bg: '#00963A', text: '#fff' },   // S-Bahn
    1: { bg: '#1C5FAD', text: '#fff' },   // U-Bahn / Stadtbahn
    2: { bg: '#E30613', text: '#fff' },   // Schnellbahn
    4: { bg: '#D4511A', text: '#fff' },   // Tram / Stadtbahn
    5: { bg: '#808080', text: '#000' },   // Stadtbus (nicht BVB)
    6: { bg: '#808080', text: '#000' },   // Regionalbus (nicht BVB)
    7: { bg: '#7C4DFF', text: '#fff' },   // Fernbus
    9: { bg: '#00ACC1', text: '#fff' },   // Fähre
    13: { bg: '#DB0A5B', text: '#fff' },  // Fernverkehr (ICE, IC, EC)
    15: { bg: '#00897B', text: '#fff' },  // Bergbahn
    16: { bg: '#E53935', text: '#fff' }   // Fernzug
  }

  return motColors[motType] || { bg: '#6366F1', text: '#fff' }
}
