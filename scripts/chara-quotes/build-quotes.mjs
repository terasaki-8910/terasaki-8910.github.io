#!/usr/bin/env node

/**
 * 名台詞のデータ(public/chara-picker/quotes.json)を、出どころ付きの元データから作る。
 *
 *   元データ: scripts/chara-quotes/sources.json
 *     [{ "id": キャラのid, "text": 台詞, "source": [根拠のURL], "checked": "verified" | "corrected" }]
 *     Web で出どころを確かめた台詞だけを入れる(記憶だけで書いたものは入れない)。
 *     corrected は、下書きの言い回しを出どころの言い回しに直したもの。
 *   出力: public/chara-picker/quotes.json
 *     { version, generatedAt, characters: { id: [台詞, ...] } }(配信するのは台詞だけ)
 *
 * 台詞の作り方と確かめ方は scripts/chara-quotes/README.md。
 * 使い方:
 *   node scripts/chara-quotes/build-quotes.mjs
 * 台詞を変えたら、続けて node scripts/build-chara-quote-fonts.mjs でフォントも作り直す。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const SOURCES = path.join(__dirname, 'sources.json');
const CHARACTERS = path.join(ROOT, 'public/chara-picker/characters.json');
const OUT = path.join(ROOT, 'public/chara-picker/quotes.json');

/** 画面に大きく出すので長すぎる台詞は落とす(下書きの決まりと同じ上限)。 */
const MAX_LENGTH = 60;
/** 1キャラあたりの上限。 */
const MAX_PER_CHARACTER = 3;

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf-8'));
  const ids = new Set(JSON.parse(fs.readFileSync(CHARACTERS, 'utf-8')).map((c) => c.id));

  const characters = {};
  const problems = [];
  for (const [i, entry] of sources.entries()) {
    const where = `sources.json[${i}] (${entry.id})`;
    const text = String(entry.text ?? '').trim();
    if (!ids.has(entry.id)) problems.push(`${where}: characters.json に無い id`);
    if (!text) problems.push(`${where}: 台詞が空`);
    if ([...text].length > MAX_LENGTH) problems.push(`${where}: ${MAX_LENGTH}字を超える`);
    if (/[「」\n]/.test(text)) problems.push(`${where}: 「」や改行を含む(表示側で付ける)`);
    if (!Array.isArray(entry.source) || entry.source.length === 0) problems.push(`${where}: 出どころが無い`);
    if (!['verified', 'corrected'].includes(entry.checked)) problems.push(`${where}: checked が verified/corrected でない`);

    const list = (characters[entry.id] ??= []);
    if (!list.includes(text)) list.push(text);
  }
  for (const [id, list] of Object.entries(characters)) {
    if (list.length > MAX_PER_CHARACTER) problems.push(`${id}: ${list.length}個(上限 ${MAX_PER_CHARACTER})`);
  }
  if (problems.length > 0) fail(`元データに問題があります:\n  ${problems.join('\n  ')}`);

  const sorted = Object.fromEntries(Object.entries(characters).sort(([a], [b]) => (a < b ? -1 : 1)));
  const out = { version: 1, generatedAt: new Date().toISOString(), characters: sorted };
  fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);

  const count = Object.values(sorted).reduce((n, list) => n + list.length, 0);
  console.log(`✅ ${path.relative(ROOT, OUT)}: ${Object.keys(sorted).length} / ${ids.size} キャラ、台詞 ${count} 個`);
}

main();
