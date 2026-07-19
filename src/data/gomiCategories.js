// ごみ収集カテゴリの表示定数(/gomi/)。
// idはpublic/gomi/data.json(scripts/update-gomi-calendar.jsが生成)と対応する。
// ラベルをソースコード側に持つのはフォントサブセット抽出の対象にするため
// (データ由来の文字はサブセットに入らずフォールバックしてしまう)。
export const GOMI_CATEGORIES = [
  { id: 'burnable', label: '燃やせるごみ', short: '燃やせる' },
  { id: 'bin', label: 'びん', short: 'びん' },
  { id: 'spray', label: 'スプレー容器', short: 'スプレー' },
  { id: 'pet', label: 'ペットボトル', short: 'ペット' },
  { id: 'nonburnable', label: '燃やせないごみ', short: '燃やせない' },
  { id: 'paper', label: '古紙・古布', short: '古紙・古布' },
  { id: 'plastic', label: 'プラスチック製容器包装', short: 'プラ容器' },
  { id: 'can', label: 'かん', short: 'かん' },
  { id: 'oversized', label: '粗大ごみ（予約制）', short: '粗大', note: '予約制' },
]

export const GOMI_CATEGORY_MAP = new Map(GOMI_CATEGORIES.map((c) => [c.id, c]))

// エリアの表示順(北→南→東→西A→西B)とラベル
export const GOMI_AREAS = [
  { slug: 'north', label: '北地区' },
  { slug: 'south', label: '南地区' },
  { slug: 'east', label: '東地区' },
  { slug: 'west-a', label: '西地区A' },
  { slug: 'west-b', label: '西地区B' },
]

export const GOMI_DEFAULT_TOWN = '春日'

// カテゴリ色はindex.cssの--gomi-<id>(ライト/ダーク両テーマで定義済み)を参照する
export function gomiColor(id) {
  return `var(--gomi-${id})`
}
