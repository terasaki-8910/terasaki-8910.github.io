#!/usr/bin/env node

/**
 * アイコンファイル生成スクリプト
 * 
 * このスクリプトは svg/icon.svg から以下のファイルを生成します：
 * - favicon.ico (16x16, 32x32, 48x48のマルチサイズ)
 * - favicon.svg (最適化されたSVG)
 * - favicon.png (32x32)
 * - apple-touch-icon.png (180x180)
 * - icon-192.png (192x192)
 * - icon-512.png (512x512)
 * - og-image.png (1200x630)
 * 
 * 使用方法:
 *   npm install sharp svg-to-ico --save-dev
 *   node svg/generate-icons.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SVG_PATH = join(__dirname, 'icon.svg');
const PUBLIC_DIR = join(__dirname, '../public');
const ICONS_DIR = join(PUBLIC_DIR, 'icons');

// iconsディレクトリが存在しない場合は作成
try {
  mkdirSync(ICONS_DIR, { recursive: true });
} catch (err) {
  // ディレクトリが既に存在する場合は無視
}

// SVGファイルを読み込む
const svgBuffer = readFileSync(SVG_PATH);

/**
 * 指定されたサイズのPNG画像を生成
 * @param {number} size - 画像のサイズ（幅と高さ）
 * @param {string} outputPath - 出力先のパス
 */
async function generatePNG(size, outputPath) {
  try {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ 生成完了: ${outputPath} (${size}x${size})`);
  } catch (err) {
    console.error(`✗ エラー: ${outputPath}`, err.message);
  }
}

/**
 * OG画像（1200x630）を生成
 * @param {string} outputPath - 出力先のパス
 */
async function generateOGImage(outputPath) {
  try {
    // 背景色を設定してSVGを中央配置
    const size = 512;
    const ogWidth = 1200;
    const ogHeight = 630;
    const padding = 100;
    
    // まずSVGを適切なサイズにレンダリング
    const iconBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    
    // 背景を作成してアイコンを合成
    await sharp({
      create: {
        width: ogWidth,
        height: ogHeight,
        channels: 4,
        background: { r: 10, g: 14, b: 39, alpha: 1 } // #0A0E27
      }
    })
    .composite([
      {
        input: iconBuffer,
        top: Math.floor((ogHeight - size) / 2),
        left: Math.floor((ogWidth - size) / 2)
      }
    ])
    .png()
    .toFile(outputPath);
    
    console.log(`✓ 生成完了: ${outputPath} (${ogWidth}x${ogHeight})`);
  } catch (err) {
    console.error(`✗ エラー: ${outputPath}`, err.message);
  }
}

/**
 * SVGファイルを最適化してコピー
 * @param {string} outputPath - 出力先のパス
 */
function copySVG(outputPath) {
  try {
    writeFileSync(outputPath, svgBuffer);
    console.log(`✓ コピー完了: ${outputPath}`);
  } catch (err) {
    console.error(`✗ エラー: ${outputPath}`, err.message);
  }
}

/**
 * マニフェストファイルを生成
 * @param {string} outputPath - 出力先のパス
 */
function generateManifest(outputPath) {
  const manifest = {
    name: "クソサイト製造工場",
    short_name: "クソサイト",
    description: "無駄に洗練されたハイテク工場",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0E27",
    theme_color: "#0A0E27",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };
  
  try {
    writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ 生成完了: ${outputPath}`);
  } catch (err) {
    console.error(`✗ エラー: ${outputPath}`, err.message);
  }
}

/**
 * ICOファイルを生成（複数サイズを含む）
 * sharpはICOを直接サポートしていないため、32x32のPNGをfavicon.icoとして保存
 */
async function generateICO(outputPath) {
  try {
    // ICOファイルは基本的に32x32のPNGで代用
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(outputPath.replace('.ico', '.png'));
    
    console.log(`✓ 生成完了: ${outputPath.replace('.ico', '.png')} (32x32)`);
    console.log(`  注意: .ico形式が必要な場合は、オンラインツールで変換してください`);
  } catch (err) {
    console.error(`✗ エラー: ${outputPath}`, err.message);
  }
}

// メイン処理
async function main() {
  console.log('\n🎨 アイコンファイルの生成を開始します...\n');
  
  // 各種サイズのPNG画像を生成
  await generatePNG(16, join(ICONS_DIR, 'favicon-16.png'));
  await generatePNG(32, join(ICONS_DIR, 'favicon-32.png'));
  await generatePNG(48, join(ICONS_DIR, 'favicon-48.png'));
  await generatePNG(180, join(ICONS_DIR, 'apple-touch-icon.png'));
  await generatePNG(192, join(ICONS_DIR, 'icon-192.png'));
  await generatePNG(512, join(ICONS_DIR, 'icon-512.png'));
  
  // OG画像を生成
  await generateOGImage(join(ICONS_DIR, 'og-image.png'));
  
  // SVGをコピー
  copySVG(join(ICONS_DIR, 'favicon.svg'));
  
  // マニフェストを生成
  generateManifest(join(ICONS_DIR, 'manifest.json'));
  
  console.log('\n✨ すべてのアイコンファイルの生成が完了しました！\n');
  console.log('📝 次のステップ:');
  console.log('  1. index.html に以下のコードを追加してください:\n');
  console.log('  <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">');
  console.log('  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">');
  console.log('  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">');
  console.log('  <link rel="manifest" href="/icons/manifest.json">');
  console.log('  <meta name="theme-color" content="#0A0E27">');
  console.log('  <meta property="og:image" content="https://terasaki-8910.github.io/icons/og-image.png">\n');
}

main().catch(console.error);
