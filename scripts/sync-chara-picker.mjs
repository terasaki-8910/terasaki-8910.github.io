#!/usr/bin/env node

/**
 * /chara-picker/ のデータとエンジンを、開発元リポジトリ
 * (terasaki-8910/Bayesian-chara-picker) から取り込む。
 *
 * ■ 役割分担（これを守る限り機械的に同期できる）
 *   向こうが正 (vendored, ここでは編集しない):
 *     - キャラ/供給/尤度データ … `npm run collect` 等で生成される
 *     - 推薦エンジン・スキーマ・状態管理hook … テストとACCEPTANCEゲートが向こうにある
 *   こちらが正 (site-owned, 向こうへは戻さない):
 *     - 画面(screens/) とコンポーネント(components/) … デザイン言語が全く違う
 *     - CharaPickerApp.tsx / loadCharaData.ts … こちらの配信方法(fetch)固有
 *
 * ■ 使い方
 *   node scripts/sync-chara-picker.mjs           取り込む
 *   node scripts/sync-chara-picker.mjs --check   差分を見るだけ(書き込まない)
 *   CHARA_PICKER_REPO=/path/to/repo node scripts/sync-chara-picker.mjs
 *
 * ■ 事故防止
 *   前回同期時のハッシュを .chara-picker-sync.json に記録しており、
 *   こちらでvendoredファイルを編集していた場合は上書きせずに中断する
 *   （その変更は向こうへ持っていく必要がある、というサイン）。
 */

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, '.chara-picker-sync.json');

const UPSTREAM = path.resolve(
  process.env.CHARA_PICKER_REPO ?? path.join(ROOT, '../chara_picker'),
);

const CHECK_ONLY = process.argv.includes('--check');

/** データ。JSONは最小化して置く（転送量。差分は向こうのリポジトリで見る）。 */
const DATA_FILES = [
  { from: 'data/characters.json', to: 'public/chara-picker/characters.json' },
  { from: 'data/supply.json', to: 'public/chara-picker/supply.json' },
  { from: 'data/bayes/likelihoods.json', to: 'public/chara-picker/likelihoods.json' },
  { from: 'data/bayes/questions.runtime.json', to: 'public/chara-picker/questions.runtime.json' },
];

/** エンジン。両リポジトリで完全に同一のファイルとして保つ（そのままコピー）。 */
const CODE_FILES = [
  ['src/engine/bayes.ts', 'src/chara/engine/bayes.ts'],
  ['src/engine/recommend.ts', 'src/chara/engine/recommend.ts'],
  ['src/engine/questions.ts', 'src/chara/engine/questions.ts'],
  ['src/engine/supply.ts', 'src/chara/engine/supply.ts'],
  ['src/engine/cooldown.ts', 'src/chara/engine/cooldown.ts'],
  ['src/data/schema.ts', 'src/chara/data/schema.ts'],
  ['src/hooks/useBayesInterview.ts', 'src/chara/hooks/useBayesInterview.ts'],
  ['src/hooks/useSessionLog.ts', 'src/chara/hooks/useSessionLog.ts'],
].map(([from, to]) => ({ from, to }));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return { files: {} };
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  } catch {
    return { files: {} };
  }
}

/** 上流での取り込み元コミット。何を取り込んだのか後から辿れるようにする。 */
function upstreamGit() {
  const git = (args) => execFileSync('git', args, { cwd: UPSTREAM, encoding: 'utf-8' }).trim();
  try {
    return {
      commit: git(['rev-parse', 'HEAD']),
      subject: git(['log', '-1', '--pretty=%s']),
      dirty: git(['status', '--porcelain']).length > 0,
    };
  } catch {
    return null;
  }
}

/** 取り込む中身を作る（データは最小化、コードはそのまま）。 */
function renderContent(entry, kind) {
  const src = path.join(UPSTREAM, entry.from);
  if (!fs.existsSync(src)) fail(`上流にファイルが見つかりません: ${entry.from}\n   (${UPSTREAM} は正しい場所ですか?)`);
  const raw = fs.readFileSync(src, 'utf-8');
  if (kind !== 'data') return Buffer.from(raw, 'utf-8');
  try {
    return Buffer.from(JSON.stringify(JSON.parse(raw)), 'utf-8');
  } catch (e) {
    fail(`${entry.from} のJSONを解釈できません: ${e.message}`);
  }
}

function characterCount(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')).length;
  } catch {
    return null;
  }
}

function characterNames(buf) {
  try {
    return new Set(JSON.parse(buf.toString('utf-8')).map((c) => c.name));
  } catch {
    return new Set();
  }
}

/** サブセットフォントに未収録の文字があるか調べる。無ければ null。 */
function missingGlyphs() {
  const py = path.join(ROOT, '.venv/bin/python3');
  if (!fs.existsSync(py)) {
    console.warn('⚠️  .venv が無いためフォント検査をスキップしました');
    console.warn('   (python3 -m venv .venv && .venv/bin/python3 -m pip install fonttools brotli)');
    return null;
  }
  const script = `
import json, sys
from fontTools.ttLib import TTFont
have = {chr(cp) for cp in TTFont('public/fonts/zen-kurenaido.woff2').getBestCmap()}
need = set()
for c in json.load(open('public/chara-picker/characters.json', encoding='utf-8')):
    need |= set(c['name']) | set(c['series'])
    for a in c.get('aliases') or []: need |= set(a)
for q in json.load(open('public/chara-picker/questions.runtime.json', encoding='utf-8'))['questions']:
    need |= set(q['prompt']) | set(q['reason']['label']) | set(q['reason']['value'])
print(''.join(sorted(ch for ch in need - have if ch.strip())))
`;
  try {
    return execFileSync(py, ['-c', script], { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch (e) {
    console.warn(`⚠️  フォント検査に失敗しました: ${e.message}`);
    return null;
  }
}

function main() {
  if (!fs.existsSync(UPSTREAM)) {
    fail(`開発元リポジトリが見つかりません: ${UPSTREAM}\n   CHARA_PICKER_REPO=/path/to/chara_picker を指定してください`);
  }

  const git = upstreamGit();
  console.log(`📦 取り込み元: ${UPSTREAM}`);
  if (git) {
    console.log(`   ${git.commit.slice(0, 7)} ${git.subject}`);
    if (git.dirty) {
      console.warn('⚠️  上流に未コミットの変更があります。確定前の内容を取り込もうとしています。');
    }
  }

  const manifest = readManifest();
  const before = characterCount(path.join(ROOT, 'public/chara-picker/characters.json'));
  const beforeNames = fs.existsSync(path.join(ROOT, 'public/chara-picker/characters.json'))
    ? characterNames(fs.readFileSync(path.join(ROOT, 'public/chara-picker/characters.json')))
    : new Set();

  const all = [
    ...DATA_FILES.map((e) => ({ ...e, kind: 'data' })),
    ...CODE_FILES.map((e) => ({ ...e, kind: 'code' })),
  ];

  const updates = [];
  const localEdits = [];
  const upToDate = [];

  for (const entry of all) {
    const dest = path.join(ROOT, entry.to);
    const next = renderContent(entry, entry.kind);
    const nextHash = sha(next);
    const recorded = manifest.files?.[entry.to];
    const current = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    const currentHash = current ? sha(current) : null;

    // こちらで vendored ファイルを編集していないか（前回同期時の記録と比較）
    if (current && recorded && currentHash !== recorded && currentHash !== nextHash) {
      localEdits.push(entry.to);
      continue;
    }
    if (currentHash === nextHash) {
      upToDate.push({ entry, nextHash });
      continue;
    }
    updates.push({ entry, next, nextHash, isNew: current === null });
  }

  if (localEdits.length > 0) {
    console.error('\n❌ こちらで編集されている取り込み対象ファイルがあります:');
    for (const f of localEdits) console.error(`   - ${f}`);
    console.error('\n   これらは開発元リポジトリが正です。変更は向こうへ移してから同期してください。');
    console.error('   （どうしても破棄してよければ .chara-picker-sync.json の該当エントリを消す）');
    process.exit(1);
  }

  if (updates.length > 0) {
    console.log(`\n更新 ${updates.length}件 / 変更なし ${upToDate.length}件`);
    for (const u of updates) {
      console.log(`   ${u.isNew ? '追加' : '更新'}: ${u.entry.to}`);
    }
  }

  if (CHECK_ONLY) {
    if (updates.length === 0) {
      console.log(`\n✅ すべて最新です (${upToDate.length}ファイル)`);
      return;
    }
    console.log('\n(--check のため書き込みはしていません)');
    process.exitCode = 1; // CI等で「差分あり」を検出できるように
    return;
  }

  for (const u of updates) {
    const dest = path.join(ROOT, u.entry.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, u.next);
  }

  // 差分の有無にかかわらず全ファイルのハッシュを記録し直す。
  // これをしないと「初回実行時に既に一致していたファイル」が記録されず、
  // その後こちらで編集しても検出できない（実装当初のバグ）。
  manifest.files = {};
  for (const { entry, nextHash } of [...updates, ...upToDate]) {
    manifest.files[entry.to] = nextHash;
  }

  if (updates.length === 0) {
    console.log(`\n✅ すべて最新です (${upToDate.length}ファイル)`);
  }

  // 取り込み元の絶対パスは記録しない（マシン固有でコミットするとノイズになる）。
  // 何を取り込んだかはコミットSHAで一意に辿れる。
  manifest.syncedAt = new Date().toISOString();
  delete manifest.upstream;
  if (git) {
    manifest.upstreamCommit = git.commit;
    manifest.upstreamSubject = git.subject;
    manifest.upstreamDirty = git.dirty;
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  if (updates.length > 0) console.log(`\n✅ 取り込み完了 (記録: ${path.basename(MANIFEST)})`);

  // キャラが増えたか
  const after = characterCount(path.join(ROOT, 'public/chara-picker/characters.json'));
  if (before !== null && after !== null && after !== before) {
    console.log(`\n🧑 キャラ数: ${before} → ${after} (${after > before ? '+' : ''}${after - before})`);
    const afterNames = characterNames(fs.readFileSync(path.join(ROOT, 'public/chara-picker/characters.json')));
    const added = [...afterNames].filter((n) => !beforeNames.has(n));
    if (added.length > 0) {
      console.log(`   新規: ${added.slice(0, 12).join('、')}${added.length > 12 ? ` ほか${added.length - 12}体` : ''}`);
    }
  }

  // 新しいキャラ名には未収録の漢字が入りうる。放置するとその字だけ
  // 別フォントにフォールバックしてチグハグに見える（実際に踏んだ問題）。
  const missing = missingGlyphs();
  if (missing) {
    console.log(`\n🔤 サブセットフォントに未収録の文字が ${[...missing].length} 種あります: ${missing.slice(0, 30)}`);
    console.log('   フォントを再生成します...');
    try {
      execFileSync('node', ['scripts/build-font-subset.mjs'], { cwd: ROOT, stdio: 'inherit' });
    } catch {
      fail('フォント再生成に失敗しました。手動で node scripts/build-font-subset.mjs を実行してください');
    }
  } else if (missing === '') {
    console.log('\n🔤 フォントは全文字を収録済み（再生成不要）');
  }

  console.log('\n次にやること:');
  console.log('  npm run typecheck && npm run build   型と配線の確認');
  console.log('  git add -A && git commit             取り込み内容をコミット');
}

main();
