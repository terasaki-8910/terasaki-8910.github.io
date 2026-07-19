import { useState } from 'react'
import { GOMI_AREAS } from '../../data/gomiCategories'

// 町(地区名)の選択。225件あり、エリアでグルーピングしてもスクロールが
// 長すぎるため、名前/かなで絞り込む検索ボックスを上に添える。
// selectそのものはネイティブのまま(モバイルネイティブピッカー・キーボード・
// スクリーンリーダー対応を維持)、検索は表示するoptionを絞るだけに留める。
export default function TownPicker({ towns, value, areaLabel, onChange }) {
  const [query, setQuery] = useState('')

  const q = query.trim()
  const matches = q ? towns.filter((t) => t.n.includes(q) || t.k.includes(q)) : towns
  // 現在選択中の町は、検索語にマッチしなくても常に選択肢に残す
  // (検索中に「選択が消えた」ように見えるのを防ぐ)
  const hasCurrent = matches.some((t) => t.n === value)
  const currentTown = towns.find((t) => t.n === value)
  const visible = hasCurrent || !currentTown ? matches : [currentTown, ...matches]

  return (
    <div className="border border-line rounded p-4">
      <label htmlFor="gomi-town-select" className="block text-lg font-display text-ink mb-3">
        地区
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="町名で検索(かな可)"
        aria-controls="gomi-town-select"
        className="w-full bg-paper text-ink text-sm border border-line rounded px-3 py-2 mb-2 focus:outline-none focus:border-celeste placeholder:text-muted"
      />
      <select
        id="gomi-town-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-paper text-ink text-sm border border-line rounded px-3 py-2.5 focus:outline-none focus:border-celeste"
      >
        {GOMI_AREAS.map((area) => {
          const group = visible.filter((t) => t.a === area.slug)
          if (group.length === 0) return null
          return (
            <optgroup key={area.slug} label={area.label}>
              {group.map((t) => (
                <option key={t.n} value={t.n}>
                  {t.n}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      {q && matches.length === 0 && (
        <p className="text-xs text-muted mt-2">「{q}」に一致する町がありません</p>
      )}
      <p className="text-xs text-muted mt-2">{areaLabel}のスケジュールを表示中</p>
    </div>
  )
}
