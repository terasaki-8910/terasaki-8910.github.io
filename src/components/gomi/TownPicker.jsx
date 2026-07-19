import { GOMI_AREAS } from '../../data/gomiCategories'

// 町(地区名)の選択。225件あるがネイティブselect+optgroupなら軽量で
// モバイルのネイティブピッカー・キーボード操作・スクリーンリーダーが
// 全部無料で付いてくる。エリアごとにグルーピング。
export default function TownPicker({ towns, value, areaLabel, onChange }) {
  return (
    <div className="border border-line rounded p-4">
      <label htmlFor="gomi-town-select" className="block text-lg font-display text-ink mb-3">
        地区
      </label>
      <select
        id="gomi-town-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-paper text-ink text-sm border border-line rounded px-3 py-2.5 focus:outline-none focus:border-celeste"
      >
        {GOMI_AREAS.map((area) => {
          const group = towns.filter((t) => t.a === area.slug)
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
      <p className="text-xs text-muted mt-2">{areaLabel}のスケジュールを表示中</p>
    </div>
  )
}
