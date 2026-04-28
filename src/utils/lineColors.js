/**
 * Gibt Hintergrundfarbe und Textfarbe für einen Linien-Badge zurück,
 * basierend auf motType oder Linienpräfix.
 */
export function getLineStyle(servingLine) {
  if (!servingLine) return { bg: '#6366F1', text: '#fff' }

  const number = servingLine.number || servingLine.symbol || ''
  const motType = parseInt(servingLine.motType ?? '5', 10)

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
    5: { bg: '#005CA9', text: '#fff' },   // Stadtbus
    6: { bg: '#E07000', text: '#fff' },   // Regionalbus
    7: { bg: '#7C4DFF', text: '#fff' },   // Fernbus
    9: { bg: '#00ACC1', text: '#fff' },   // Fähre
    13: { bg: '#DB0A5B', text: '#fff' },  // Fernverkehr (ICE, IC, EC)
    15: { bg: '#00897B', text: '#fff' },  // Bergbahn
    16: { bg: '#E53935', text: '#fff' }   // Fernzug
  }

  return motColors[motType] || { bg: '#6366F1', text: '#fff' }
}
