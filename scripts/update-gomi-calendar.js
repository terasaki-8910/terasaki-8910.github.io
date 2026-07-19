#!/usr/bin/env node

/**
 * つくば市ごみ収集日程オープンデータの取得・変換スクリプト
 *
 * データ元: つくば市「ごみ収集日程」ページ(CC BY 4.0)
 *   https://www.city.tsukuba.lg.jp/soshikikarasagasu/seikatsukankyobukankyoeiseika/gyomuannai/2/1000820.html
 * ページには月別のxlsx(年度分12ファイル)がリンクされている。ファイルURLは
 * 年度ごとに変わるため、ページHTMLからリンクをスクレイプして自動追従する。
 *
 * xlsxの構造(2026年度時点、パース時にassertで検証):
 *   1シート、行=町(約225町)、列=A:町名 / B:備考(エリア名+改行+かな) /
 *   C〜K:9カテゴリの収集日(カンマ区切り "2027/03/02,2027/03/05,...")
 *
 * 重要な検証済みの事実: 収集スケジュールは町ごとではなく「エリア」
 * (北地区/南地区/東地区/西地区A/西地区B の5種)で完全に共通。
 * このスクリプトはそれを前提とし、前提が崩れたら(市がデータ構造を
 * 変えたら)exit 1で失敗して既存データを保護する。
 *
 * 出力:
 *   public/gomi/data.json      — エリア別日程 + 町→エリアのマッピング
 *   public/gomi/ics/<slug>.ics — エリア別iCal(Googleカレンダー等の購読用)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../public/gomi');
const ICS_DIR = path.join(OUT_DIR, 'ics');

const PAGE_URL =
  'https://www.city.tsukuba.lg.jp/soshikikarasagasu/seikatsukankyobukankyoeiseika/gyomuannai/2/1000820.html';
const SITE_ORIGIN = 'https://terasaki-8910.github.io';

// ヘッダーのカテゴリ名 → id(順序は表示順としてもそのまま使う)
const CATEGORIES = [
  { id: 'burnable', label: '燃やせるごみ' },
  { id: 'bin', label: 'びん' },
  { id: 'spray', label: 'スプレー容器' },
  { id: 'pet', label: 'ペットボトル' },
  { id: 'nonburnable', label: '燃やせないごみ' },
  { id: 'paper', label: '古紙・古布' },
  { id: 'plastic', label: 'プラスチック製容器包装' },
  { id: 'can', label: 'かん' },
  { id: 'oversized', label: '粗大ごみ（予約制）', note: '予約制' },
];
const LABEL_TO_ID = new Map(CATEGORIES.map((c) => [c.label, c.id]));

const AREA_SLUGS = new Map([
  ['北地区', 'north'],
  ['南地区', 'south'],
  ['東地区', 'east'],
  ['西地区A', 'west-a'],
  ['西地区B', 'west-b'],
]);

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`fetch failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// セル値を素のテキストに正規化(_x000D_はxlsx内のCR残骸)
function cellText(cell) {
  const t = cell?.text ?? '';
  return String(t).replace(/_x000D_/g, '').replace(/\r/g, '');
}

async function main() {
  console.log('📄 市ページからxlsxリンクを収集...');
  const pageHtml = (await fetchBuffer(PAGE_URL)).toString('utf-8');
  const links = [
    ...new Set(
      [...pageHtml.matchAll(/\/material\/files\/group\/138\/(\d{6})_calendar\.xlsx/g)].map(
        (m) => ({ yyyymm: m[1], url: `https://www.city.tsukuba.lg.jp${m[0]}` })
      )
    ),
  ];
  // Setはオブジェクトを重複排除しないのでyyyymmで明示的にdedupe
  const byMonth = new Map(links.map((l) => [l.yyyymm, l.url]));
  if (byMonth.size < 12) fail(`月別xlsxリンクが12件未満: ${byMonth.size}件`);
  const months = [...byMonth.keys()].sort();
  console.log(`  ${byMonth.size}ファイル: ${months[0]}〜${months[months.length - 1]}`);

  // 年度 = 最初の月(4月始まり)の年
  const fiscalYear = months[0].slice(0, 4);

  // area slug -> { label, days: Map<date, Set<catId>> }
  const areas = new Map();
  // town name -> { kana, areaSlug }
  const towns = new Map();

  for (const [yyyymm, url] of [...byMonth.entries()].sort()) {
    console.log(`⬇️  ${yyyymm} を取得・解析...`);
    const buf = await fetchBuffer(url);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) fail(`${yyyymm}: シートが見つからない`);

    // ヘッダー検証(A=地区名1, B=備考, C..K=既知の9カテゴリ)
    const header = ws.getRow(1);
    const colToCat = new Map(); // 列番号 -> catId
    for (let col = 3; col <= 11; col++) {
      const label = cellText(header.getCell(col)).trim();
      const id = LABEL_TO_ID.get(label);
      if (!id) fail(`${yyyymm}: 未知のカテゴリ列 "${label}" (col ${col})`);
      colToCat.set(col, id);
    }
    if (colToCat.size !== 9) fail(`${yyyymm}: カテゴリ列が9列でない`);

    // エリアごとのスケジュール署名(エリア内の完全一致検証用)
    const areaSig = new Map();

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const town = cellText(row.getCell(1)).trim();
      if (!town) return;
      const memoLines = cellText(row.getCell(2)).split('\n').map((s) => s.trim());
      const areaLabel = memoLines[0] || '';
      const kana = memoLines[1] || '';
      const slug = AREA_SLUGS.get(areaLabel);
      if (!slug) fail(`${yyyymm}: 未知のエリア "${areaLabel}" (町: ${town})`);

      // 町→エリアの一貫性(月をまたいで変わったら失敗)
      const known = towns.get(town);
      if (known && known.areaSlug !== slug) {
        fail(`町 "${town}" のエリアが月によって異なる: ${known.areaSlug} vs ${slug}`);
      }
      if (!known) towns.set(town, { kana, areaSlug: slug });

      // スケジュール署名と日付の収集
      const sigParts = [];
      if (!areas.has(slug)) areas.set(slug, { label: areaLabel, days: new Map() });
      const area = areas.get(slug);
      for (const [col, catId] of colToCat) {
        const raw = cellText(row.getCell(col)).trim();
        sigParts.push(raw);
        if (!raw) continue;
        for (const d of raw.split(',')) {
          const m = d.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
          if (!m) fail(`${yyyymm}: 不正な日付 "${d}" (町: ${town})`);
          const iso = `${m[1]}-${m[2]}-${m[3]}`;
          if (!area.days.has(iso)) area.days.set(iso, new Set());
          area.days.get(iso).add(catId);
        }
      }
      const sig = sigParts.join('|');
      if (areaSig.has(slug) && areaSig.get(slug) !== sig) {
        fail(`${yyyymm}: エリア "${areaLabel}" 内でスケジュールが町ごとに異なる(前提が崩れた)`);
      }
      areaSig.set(slug, sig);
    });
  }

  // 全体検証
  if (areas.size !== 5) fail(`エリア数が5でない: ${areas.size}`);
  if (towns.size < 200) fail(`町数が少なすぎる: ${towns.size}`);
  if (!towns.has('春日')) fail('デフォルト町「春日」がデータに存在しない');

  const lastUpdated = new Date().toISOString();

  // ---- 変更検知 ----
  // lastUpdated(実行時刻)を除いた実質的な内容が既存ファイルと同一なら
  // 何も書かずに終了する。これをしないとDTSTAMPやlastUpdatedの時刻だけが
  // 変わった無意味な差分が毎週コミットされ続ける。
  const dataPath = path.join(OUT_DIR, 'data.json');

  // ---- data.json ----
  const data = {
    lastUpdated,
    fiscalYear,
    source: {
      page: PAGE_URL,
      license: 'CC BY 4.0',
      attribution: 'つくば市ごみ収集日程オープンデータ',
    },
    categories: CATEGORIES,
    areas: Object.fromEntries(
      [...areas.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, { label, days }]) => [
          slug,
          {
            label,
            days: Object.fromEntries(
              [...days.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, cats]) => [
                  date,
                  CATEGORIES.filter((c) => cats.has(c.id)).map((c) => c.id),
                ])
            ),
          },
        ])
    ),
    towns: [...towns.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ja'))
      .map(([n, { kana, areaSlug }]) => ({ n, k: kana, a: areaSlug })),
  };

  // 既存data.jsonとlastUpdated以外を比較し、同一なら書き込みをスキップ
  if (fs.existsSync(dataPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const strip = (obj) => JSON.stringify({ ...obj, lastUpdated: null });
      if (strip(prev) === strip(data)) {
        console.log('ℹ️  データに変更なし。ファイルは更新しません。');
        return;
      }
    } catch {
      // 既存ファイルが壊れている場合は普通に書き直す
    }
  }

  fs.mkdirSync(ICS_DIR, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data));
  const jsonKb = (fs.statSync(dataPath).size / 1024).toFixed(1);
  console.log(`✅ data.json (${jsonKb}KB, ${towns.size}町, ${areas.size}エリア)`);

  // ---- ics(エリアごと) ----
  // DTSTAMPは実行時刻ではなく年度から決定的に導出する。実行時刻を使うと
  // 内容が同じでも毎回全icsファイルが書き換わってしまう
  const dtstamp = `${fiscalYear}0401T000000Z`;
  for (const [slug, { label, days }] of areas) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//terasaki-8910.github.io//gomi-calendar//JA`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:つくば市ごみ収集（${label}）`,
      'X-WR-TIMEZONE:Asia/Tokyo',
      'X-PUBLISHED-TTL:P1W',
      'REFRESH-INTERVAL;VALUE=DURATION:P1W',
    ];
    const sortedDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [date, cats] of sortedDays) {
      const ymd = date.replace(/-/g, '');
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextYmd = next.toISOString().slice(0, 10).replace(/-/g, '');
      for (const cat of CATEGORIES) {
        if (!cats.has(cat.id)) continue;
        lines.push(
          'BEGIN:VEVENT',
          `UID:gomi-${slug}-${ymd}-${cat.id}@terasaki-8910.github.io`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${ymd}`,
          `DTEND;VALUE=DATE:${nextYmd}`,
          `SUMMARY:${cat.label}`,
          'TRANSP:TRANSPARENT',
          'END:VEVENT'
        );
      }
    }
    lines.push('END:VCALENDAR');

    // 75オクテット折り返し(UTF-8バイト長基準、文字境界で分割)
    const folded = [];
    for (const line of lines) {
      let cur = '';
      let curBytes = 0;
      let limit = 75;
      for (const ch of line) {
        const chBytes = Buffer.byteLength(ch, 'utf-8');
        if (curBytes + chBytes > limit) {
          folded.push(cur);
          cur = ' ' + ch; // 継続行は先頭スペース
          curBytes = 1 + chBytes;
          limit = 75;
        } else {
          cur += ch;
          curBytes += chBytes;
        }
      }
      folded.push(cur);
    }

    // self-check: 全行75オクテット以下
    for (const l of folded) {
      if (Buffer.byteLength(l, 'utf-8') > 75) fail(`ics折り返し失敗: "${l.slice(0, 40)}..."`);
    }
    // self-check: UID一意
    const uids = folded.filter((l) => l.startsWith('UID:'));
    if (new Set(uids).size !== uids.length) fail(`${slug}: UID重複`);

    const icsPath = path.join(ICS_DIR, `${slug}.ics`);
    fs.writeFileSync(icsPath, folded.join('\r\n') + '\r\n');
    console.log(`✅ ics/${slug}.ics (${uids.length}イベント)`);
  }

  console.log(`\n✨ 完了 (${SITE_ORIGIN}/gomi/ で表示、ics購読URL: ${SITE_ORIGIN}/gomi/ics/<area>.ics)`);
}

main().catch((e) => fail(e.stack || e.message));
