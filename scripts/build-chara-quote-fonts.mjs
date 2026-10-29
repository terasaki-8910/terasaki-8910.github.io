#!/usr/bin/env node

/**
 * 推しア◯ネイターのガチャ演出と名台詞に使うサブセットフォントを作る。
 *
 *   1. public/fonts/gacha-rounded.woff2
 *      M PLUS Rounded 1c ExtraBold(SIL OFL 1.1)。ガチャ演出の字すべて
 *      (台詞・キャラ名・作品名・NEW などの表示の字)。演出を開いたときにだけ読まれる。
 *   2. public/fonts/zen-kurenaido-quotes.woff2
 *      Zen Kurenaido。台詞の字のうち、本文のサブセット(zen-kurenaido.woff2)に無いものだけ。
 *      結果画面で台詞を出したときにだけ読まれる(src/chara/components/quote.css)。
 *
 * なぜ本文のサブセット(build-font-subset.mjs)に台詞の字を足さないか:
 *   本文のフォントはサイトの全ページで読む。台詞にしか出てこない字は千字単位あり、
 *   全ページの読み込みを重くしてまで持つものではないため、台詞を出す画面だけに分けた。
 *
 * 前提: build-font-subset.mjs と同じ(python3 + fonttools + brotli、ネットワーク)。
 * 使い方:
 *   node scripts/build-chara-quote-fonts.mjs
 * characters.json か quotes.json が変わったとき(どちらも同期 sync-chara-picker.mjs で入る)と、
 * 本文のサブセットを作り直したとき(2. の足りない字の集合が変わるため)に作り直す。
 * 同期はそのどれかがあればこれを呼ぶ。
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const GACHA_TTF_URL =
  'https://github.com/google/fonts/raw/main/ofl/mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf';
const QUOTE_TTF_URL =
  'https://github.com/google/fonts/raw/main/ofl/zenkurenaido/ZenKurenaido-Regular.ttf';
const BODY_WOFF2 = path.join(ROOT, 'public/fonts/zen-kurenaido.woff2');
const OUT_GACHA = path.join(ROOT, 'public/fonts/gacha-rounded.woff2');
const OUT_QUOTES = path.join(ROOT, 'public/fonts/zen-kurenaido-quotes.woff2');

const CHARACTERS = path.join(ROOT, 'public/chara-picker/characters.json');
const QUOTES = path.join(ROOT, 'public/chara-picker/quotes.json');

/** fontTools を持つ python。build-font-subset.mjs と同じ選び方(Windows は python3 が無いことがある)。 */
const VENV_PYTHON = path.join(ROOT, '.venv/bin/python3');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : process.platform === 'win32' ? 'python' : 'python3';

/** ガチャ演出の画面に出る、データ以外の字(GachaReveal.tsx)。 */
const GACHA_UI_TEXT = 'NEW[]';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/** 制御文字を落として、並べた文字列にする。 */
function toCharset(chars) {
  return [...chars]
    .filter((ch) => {
      const cp = ch.codePointAt(0);
      return cp >= 0x20 && !(cp >= 0x7f && cp <= 0x9f);
    })
    .sort()
    .join('');
}

function subset(ttfPath, text, outPath, tmpDir) {
  const charsetPath = path.join(tmpDir, `${path.basename(outPath)}.txt`);
  fs.writeFileSync(charsetPath, text, 'utf-8');
  execFileSync(
    PYTHON,
    [
      '-m', 'fontTools.subset', ttfPath,
      `--text-file=${charsetPath}`,
      '--flavor=woff2',
      '--layout-features=*',
      '--no-hinting',
      `--output-file=${outPath}`,
    ],
    { stdio: 'inherit' },
  );
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✅ ${path.relative(ROOT, outPath)} (${kb}KB / ${text.length}文字種)`);
}

/** 本文のサブセットに入っている字(cmap)。 */
function bodyCoverage() {
  const out = execFileSync(
    PYTHON,
    [
      '-c',
      'import sys; from fontTools.ttLib import TTFont; ' +
        'print(" ".join(str(c) for c in TTFont(sys.argv[1]).getBestCmap()))',
      BODY_WOFF2,
    ],
    { encoding: 'utf-8' },
  );
  return new Set(out.trim().split(/\s+/).map((cp) => String.fromCodePoint(Number(cp))));
}

function main() {
  const characters = readJson(CHARACTERS);
  const quotes = fs.existsSync(QUOTES) ? readJson(QUOTES) : { characters: {} };
  const quoteText = Object.values(quotes.characters ?? {}).flat().join('');

  const gacha = new Set();
  for (let cp = 0x20; cp <= 0x7e; cp++) gacha.add(String.fromCodePoint(cp));
  for (const c of characters) for (const ch of `${c.name}${c.series}`) gacha.add(ch);
  for (const ch of quoteText + GACHA_UI_TEXT) gacha.add(ch);

  const covered = bodyCoverage();
  const missing = new Set([...quoteText].filter((ch) => !covered.has(ch) && ch.trim() !== ''));
  console.log(`台詞 ${Object.keys(quotes.characters ?? {}).length} キャラ分。本文のサブセットに無い字: ${missing.size}`);

  const tmpDir = fs.mkdtempSync(path.join(ROOT, '.font-subset-'));
  try {
    const gachaTtf = path.join(tmpDir, 'MPLUSRounded1c-ExtraBold.ttf');
    const quoteTtf = path.join(tmpDir, 'ZenKurenaido-Regular.ttf');
    console.log('TTF原本を取得中...');
    execFileSync('curl', ['-sSL', '-o', gachaTtf, GACHA_TTF_URL], { stdio: 'inherit' });
    execFileSync('curl', ['-sSL', '-o', quoteTtf, QUOTE_TTF_URL], { stdio: 'inherit' });

    subset(gachaTtf, toCharset(gacha), OUT_GACHA, tmpDir);
    // 足りない字が無くても空のファイルは作れないので、空白だけのフォントにしておく(CSS からの参照を切らさない)
    subset(quoteTtf, toCharset(missing.size > 0 ? missing : new Set([' '])), OUT_QUOTES, tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
