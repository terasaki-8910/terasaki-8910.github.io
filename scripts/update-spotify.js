import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// dotenvを設定
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

// 環境変数から認証情報を取得
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('❌ 必要な環境変数が設定されていません');
  process.exit(1);
}

// リフレッシュトークンから新しいアクセストークンを取得
async function getAccessToken() {
  console.log('🔄 アクセストークンを更新中...');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('🔍 APIエラー詳細:', errorData);
    if (errorData.error === 'invalid_grant') {
      // 2026-07-20にこれで10日間気づかず止まった。原因が一目で分かるようにする。
      console.error('');
      console.error('=================================================================');
      console.error(' リフレッシュトークンが無効です（期限切れ/失効）。');
      console.error(' コードでは復旧できません。Spotifyで再認可し、GitHub Secretsの');
      console.error(' SPOTIFY_REFRESH_TOKEN を更新してください:');
      console.error('   node scripts/get-refresh-token.js');
      console.error('   gh secret set SPOTIFY_REFRESH_TOKEN');
      console.error('=================================================================');
    }
    throw new Error(`アクセストークン取得失敗: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ アクセストークン取得成功');

  // Spotifyはリフレッシュ時に新しいrefresh_tokenを返すことがある(ローテーション)。
  // 返ってきたのに古いトークンを使い続けると、いずれ失効して更新が止まる
  // (実際に2026-07-20から10日間停止した)。ここでは書き戻せない(Secretsへの
  // 書き込み権限がGITHUB_TOKENに無い)ので、検知したら明示的に警告する。
  if (data.refresh_token && data.refresh_token !== REFRESH_TOKEN) {
    console.warn('');
    console.warn('⚠️  Spotifyが新しいリフレッシュトークンを発行しました(ローテーション)。');
    console.warn('   GitHub Secretsの SPOTIFY_REFRESH_TOKEN を更新しないと、');
    console.warn('   古いトークンはいずれ失効して更新が止まります。');
    console.warn('   更新用の値はログに出しません。次のコマンドで取得してください:');
    console.warn('     node scripts/get-refresh-token.js');
    console.warn('');
  }

  return data.access_token;
}

// 最近再生した曲を取得
async function getRecentlyPlayed(accessToken) {
  console.log('🎵 最近再生した曲を取得中...');

  // 過去50件の再生履歴を取得
  const url = 'https://api.spotify.com/v1/me/player/recently-played?limit=50';

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Spotify API呼び出し失敗: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ ${data.items.length}件の再生履歴を取得`);
  return data.items;
}

// トラックデータを整形
function formatTracks(items) {
  const tracks = [];
  const seen = new Set(); // 重複排除用

  items.forEach(item => {
    const track = item.track;

    // 曲IDのみで重複排除（同じ曲の複数回再生を防ぐため）
    const uniqueKey = track.id;

    if (!seen.has(uniqueKey) && tracks.length < 30) { // 最大30件
      seen.add(uniqueKey);

      tracks.push({
        id: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        albumArt: track.album.images[0]?.url || '',
        playedAt: item.played_at,
        spotifyUrl: track.external_urls.spotify,
        duration: track.duration_ms,
        previewUrl: track.preview_url || ''
      });
    }
  });

  return tracks;
}

/**
 * 曲の中身が前回と同じかどうか。`lastUpdated` は実行するたびに必ず変わるので、
 * それを除いて比較する。
 *
 * これをしないと、再生履歴が1曲も増えていなくてもタイムスタンプだけの差分で
 * 毎回コミットが積まれる（6時間ごとに1回、中身ゼロのコミットが増え続ける）。
 * gomiパイプラインで同じ問題を直したときと同じ考え方。
 */
function isSameContent(prevPath, next) {
  if (!fs.existsSync(prevPath)) return false;
  try {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
    const strip = (d) => JSON.stringify({ ...d, lastUpdated: null });
    return strip(prev) === strip(next);
  } catch {
    // 前回分が壊れている場合は普通に書き直す
    return false;
  }
}

// JSONファイルを生成
function generateJSON(tracks) {
  const data = {
    lastUpdated: new Date().toISOString(),
    tracks: tracks,
    total: tracks.length
  };

  const outputPath = path.join(process.cwd(), 'public', 'spotify-data.json');
  const docsPath = path.join(process.cwd(), 'docs', 'spotify-data.json');

  // 中身が変わっていなければ一切書き込まない。書き込まなければ git diff も出ず、
  // ワークフローの `git diff --staged --quiet` がコミットを作らない。
  if (isSameContent(outputPath, data)) {
    console.log('ℹ️  再生履歴に変更なし。ファイルは更新しません。');
    return { ...data, unchanged: true };
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  // docs/ はビルド成果物だが、Spotifyデータだけは実行時fetchで読むため
  // ここでも直接更新する（次のビルドを待たずに本番へ反映させる）。
  if (fs.existsSync(path.dirname(docsPath))) {
    fs.writeFileSync(docsPath, JSON.stringify(data, null, 2));
    console.log(`📁 JSONファイルを生成: ${docsPath}`);
  }
  console.log(`📁 JSONファイルを生成: ${outputPath}`);

  return data;
}

// メイン処理
async function main() {
  try {
    console.log('🚀 Spotifyデータ更新を開始...');

    // 1. アクセストークン取得
    const accessToken = await getAccessToken();

    // 2. 最近再生した曲を取得
    const items = await getRecentlyPlayed(accessToken);

    // 3. データを整形
    const tracks = formatTracks(items);

    // 4. JSONファイル生成
    const data = generateJSON(tracks);

    if (data.unchanged) {
      console.log('✅ 完了(変更なしのためコミットは発生しません)');
      return;
    }

    console.log('✅ Spotifyデータ更新完了!');
    console.log(`📊 更新件数: ${tracks.length}曲`);
    console.log(`⏰ 更新時刻: ${data.lastUpdated}`);

    // 最新5曲を表示
    console.log('\n🎵 最新5曲:');
    tracks.slice(0, 5).forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} - ${track.artist}`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

main();