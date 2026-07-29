#!/usr/bin/env node

/**
 * Zen Kurenaido(本文用)のサブセットフォントを再生成する。
 *
 * なぜスクリプト化したか:
 *   表示される文字はソースコードだけに現れるとは限らない。ごみカレンダーの町名225件も
 *   キャラピッカーのキャラ名184件も *データ(JSON)由来* で、ソースを grep しても出てこない。
 *   これを手順書だけで運用していたため「データを足したらフォントに字が無い」事故が
 *   実際に起きた。抽出元をこのファイルに列挙して機械的に再現できるようにする。
 *
 * 前提(初回のみ):
 *   python3 -m venv .venv
 *   .venv/bin/python3 -m pip install fonttools brotli
 *   (brotli が無いと woff2 で書き出せない。macOSのpython3はPEP 668で外部管理
 *    のためシステムに直接入れられず、.venv に隔離する。.venvはgitignore済み)
 *
 * 使い方:
 *   node scripts/build-font-subset.mjs
 *
 * 注意:
 *   以前使っていた Google Fonts の `text=` 指定API(css2?family=...&text=...)は、
 *   文字数が多いとスライス配信(woff2が100個以上に分割される)へ勝手に劣化するため
 *   使えない。TTF原本を取得してローカルでサブセット化する方式にしてある。
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TTF_URL =
  'https://github.com/google/fonts/raw/main/ofl/zenkurenaido/ZenKurenaido-Regular.ttf';
const OUT_WOFF2 = path.join(ROOT, 'public/fonts/zen-kurenaido.woff2');

/** fontTools を持つ python。リポジトリ内の .venv を優先し、無ければ素の python3 を試す。 */
const VENV_PYTHON = path.join(ROOT, '.venv/bin/python3');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

/** ソースを走査して日本語文字を拾う対象。 */
const SOURCE_GLOB_DIRS = ['src', 'index.html', 'ascii', 'spotify', 'gomi-tsukuba', 'chara-picker', '404.html'];

/**
 * データ(JSON)由来の表示文字。ソース走査に載らないのでここで明示する。
 * 新しいデータ駆動ページを追加したらここに足すこと。
 */
const DATA_SOURCES = [
  {
    file: 'public/gomi-tsukuba/data.json',
    label: 'ごみカレンダーの町名・かな・エリア名',
    extract: (json) => {
      const out = [];
      for (const t of json.towns ?? []) out.push(t.n ?? '', t.k ?? '');
      for (const a of Object.values(json.areas ?? {})) out.push(a.label ?? '');
      for (const c of json.categories ?? []) out.push(c.label ?? '');
      return out;
    },
  },
  {
    file: 'public/chara-picker/characters.json',
    label: 'キャラピッカーのキャラ名・作品名・別名',
    extract: (json) => {
      const out = [];
      for (const c of json) {
        out.push(c.name ?? '', c.series ?? '', ...(c.aliases ?? []));
        for (const v of Object.values(c.axes ?? {})) {
          if (typeof v === 'string') out.push(v);
          else if (Array.isArray(v)) out.push(...v);
        }
      }
      return out;
    },
  },
  {
    file: 'public/chara-picker/questions.runtime.json',
    label: 'キャラピッカーの質問文',
    extract: (json) => {
      const out = [];
      for (const q of json.questions ?? []) {
        out.push(q.prompt ?? '', q.reason?.label ?? '', q.reason?.value ?? '');
      }
      return out;
    },
  },
];

/**
 * コメントを落としてから文字を拾う。このリポジトリのコメントは日本語で非常に長く、
 * そのまま入れると描画されない字が大量にサブセットへ混入する
 * (実測でフォントが137KB→218KBまで膨らんだ)。
 * 文字集合の抽出が目的なので、文字列リテラル内の "//" を誤って落とすような
 * 取りこぼしがあっても実害は無い(その字が別の箇所にもあれば拾えるため)。
 */
function stripComments(code, file) {
  if (file.endsWith('.css')) return code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (file.endsWith('.html')) return code.replace(/<!--[\s\S]*?-->/g, ' ');
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function walk(target, acc = []) {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return acc;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (/\.(jsx?|tsx?|html|css)$/.test(abs)) acc.push(abs);
    return acc;
  }
  for (const entry of fs.readdirSync(abs)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    walk(path.join(target, entry), acc);
  }
  return acc;
}

function main() {
  const chars = new Set();

  // 印字可能ASCII全域。英数字が別フォントにフォールバックして
  // 和欧混植がチグハグに見える問題への対処(過去に一度踏んでいる)。
  for (let cp = 0x20; cp <= 0x7e; cp++) chars.add(String.fromCodePoint(cp));

  let sourceFiles = 0;
  for (const target of SOURCE_GLOB_DIRS) {
    for (const file of walk(target)) {
      sourceFiles++;
      for (const ch of stripComments(fs.readFileSync(file, 'utf-8'), file)) chars.add(ch);
    }
  }
  console.log(`ソース ${sourceFiles} ファイルを走査`);

  for (const src of DATA_SOURCES) {
    const abs = path.join(ROOT, src.file);
    if (!fs.existsSync(abs)) {
      console.warn(`⚠️  ${src.file} が無いのでスキップ (${src.label})`);
      continue;
    }
    const json = JSON.parse(fs.readFileSync(abs, 'utf-8'));
    let n = 0;
    for (const s of src.extract(json)) {
      for (const ch of String(s)) {
        if (!chars.has(ch)) n++;
        chars.add(ch);
      }
    }
    console.log(`${src.file}: 新規 ${n} 文字 (${src.label})`);
  }

  // 制御文字とサロゲート単体は落とす
  for (const ch of [...chars]) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) chars.delete(ch);
  }

  const text = [...chars].sort().join('');
  console.log(`\n合計 ${text.length} 文字種`);

  const tmpDir = fs.mkdtempSync(path.join(ROOT, '.font-subset-'));
  try {
    const charsetPath = path.join(tmpDir, 'charset.txt');
    const ttfPath = path.join(tmpDir, 'ZenKurenaido-Regular.ttf');
    fs.writeFileSync(charsetPath, text, 'utf-8');

    console.log('TTF原本を取得中...');
    execFileSync('curl', ['-sSL', '-o', ttfPath, TTF_URL], { stdio: 'inherit' });

    console.log(`サブセット化中... (${PYTHON})`);
    execFileSync(
      PYTHON,
      [
        '-m', 'fontTools.subset', ttfPath,
        `--text-file=${charsetPath}`,
        '--flavor=woff2',
        "--layout-features=*",
        '--no-hinting',
        `--output-file=${OUT_WOFF2}`,
      ],
      { stdio: 'inherit' },
    );

    const kb = (fs.statSync(OUT_WOFF2).size / 1024).toFixed(0);
    console.log(`\n✅ ${path.relative(ROOT, OUT_WOFF2)} (${kb}KB / ${text.length}文字種)`);
    console.log('   src/index.css のコメントにあるサイズ表記も更新すること。');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
