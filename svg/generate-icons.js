#!/usr/bin/env node

/**
 * アイコンファイル生成スクリプト
 *
 * svg/logo.png (Nano Bananaで生成したキャラクターアート、ラスター画像) から
 * 以下のファイルを生成します:
 * - favicon-16.png / favicon-32.png / favicon-48.png
 * - apple-touch-icon.png (180x180)
 * - icon-192.png / icon-512.png (PWA用)
 * - og-image.png (1200x630, SNSシェア用)
 * - home-avatar.png (128x128, ヘッダーのHomeリンク用。顔を中心にクロップ)
 * - manifest.json
 *
 * ラスター画像が入力のため、ベクター(favicon.svg)は生成しない。
 * 自動トレースは複雑なイラストには不向きで、PNGを複数サイズ並べる
 * 構成で十分機能する(index.htmlも既にPNGのみの構成)。
 *
 * 使用方法:
 *   cd svg && npm install && npm run generate
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGO_PATH = join(__dirname, 'logo.png');
const PUBLIC_DIR = join(__dirname, '../public');
const ICONS_DIR = join(PUBLIC_DIR, 'icons');

try {
  mkdirSync(ICONS_DIR, { recursive: true });
} catch (err) {
  // 既に存在する場合は無視
}

const logoBuffer = readFileSync(LOGO_PATH);

async function generatePNG(size, outputPath) {
  await sharp(logoBuffer)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(outputPath);
  console.log(`✓ 生成完了: ${outputPath} (${size}x${size})`);
}

/**
 * OG画像(1200x630)を生成。ロゴは正方形なので高さ630に合わせて中央配置し、
 * 左右の余白はロゴ自体の背景色(サンプリング済み)でピラーボックスする。
 */
async function generateOGImage(outputPath, bg) {
  const ogWidth = 1200;
  const ogHeight = 630;

  const resizedLogo = await sharp(logoBuffer)
    .resize(ogHeight, ogHeight, { fit: 'cover' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: ogWidth,
      height: ogHeight,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      {
        input: resizedLogo,
        top: 0,
        left: Math.floor((ogWidth - ogHeight) / 2),
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`✓ 生成完了: ${outputPath} (${ogWidth}x${ogHeight})`);
}

// ヘッダーのHomeリンクは22px前後の丸アイコンとして表示するため、
// 単純な全体リサイズ(favicon等と同じcover)だと顔ではなく上部の髪飾りが
// 中心に来てしまう。目の位置を基準にした正方形を切り出してから縮小する。
async function generateHomeAvatar(outputPath) {
  const cropped = await sharp(logoBuffer)
    .extract({ left: 230, top: 330, width: 600, height: 600 })
    .resize(128, 128)
    .png()
    .toFile(outputPath);
  console.log(`✓ 生成完了: ${outputPath} (128x128, 顔クロップ)`);
  return cropped;
}

function generateManifest(outputPath) {
  const manifest = {
    name: '@オーバーライド — 冬色',
    short_name: '@オーバーライド',
    description: '冬色のポートフォリオ。取り組んできたプロジェクト、未完成のアイデア、ついでの自己紹介。',
    start_url: '/',
    display: 'standalone',
    background_color: '#F9EC8E',
    theme_color: '#F9EC8E',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ 生成完了: ${outputPath}`);
}

async function main() {
  console.log('\n🎨 アイコンファイルの生成を開始します...\n');

  // ロゴ左上角の1pxをそのまま読む(resizeでの平均化を避け、実際の
  // 背景色をそのままOG画像のピラーボックスに使う)
  const { data } = await sharp(logoBuffer)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  console.log(`  背景色サンプリング: rgb(${data[0]}, ${data[1]}, ${data[2]})`);

  await generatePNG(16, join(ICONS_DIR, 'favicon-16.png'));
  await generatePNG(32, join(ICONS_DIR, 'favicon-32.png'));
  await generatePNG(48, join(ICONS_DIR, 'favicon-48.png'));
  await generatePNG(180, join(ICONS_DIR, 'apple-touch-icon.png'));
  await generatePNG(192, join(ICONS_DIR, 'icon-192.png'));
  await generatePNG(512, join(ICONS_DIR, 'icon-512.png'));

  await generateOGImage(join(ICONS_DIR, 'og-image.png'), bg);
  await generateHomeAvatar(join(ICONS_DIR, 'home-avatar.png'));

  generateManifest(join(ICONS_DIR, 'manifest.json'));

  console.log('\n✨ すべてのアイコンファイルの生成が完了しました！\n');
}

main().catch(console.error);
