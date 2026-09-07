// Color coding for the AI-estimated rarity value (free text from Gemini —
// e.g. "Common", "Scarce", "Rare", "Very Rare", "Key Date" — so this matches
// by keyword rather than an exact enum).
function rarityClass(rarity: string): string {
  const r = rarity.toLowerCase()
  if (r.includes('key date') || r.includes('extremely rare') || r.includes('very rare')) return 'rarity-badge-extreme'
  if (r.includes('rare')) return 'rarity-badge-rare'
  if (r.includes('scarce') || r.includes('uncommon')) return 'rarity-badge-scarce'
  if (r.includes('common')) return 'rarity-badge-common'
  return 'rarity-badge-unknown'
}

export function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null
  return <span className={`rarity-badge ${rarityClass(rarity)}`}>{rarity}</span>
}
