import fs from 'fs';
import path from 'path';

// dotenvを設定
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

if (!STEAM_API_KEY || !STEAM_ID) {
  console.error('❌ 必要な環境変数が設定されていません (STEAM_API_KEY, STEAM_ID)');
  process.exit(1);
}

// 実績データを取る対象の上限(所持ゲーム全部だとAPI呼び出しが膨れるため、
// プレイ時間上位N本に絞る。本人確認済み)
const ACHIEVEMENT_GAME_LIMIT = 10;

const ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps';

async function steamGet(interfaceName, method, version, params) {
  const url = new URL(`https://api.steampowered.com/${interfaceName}/${method}/${version}/`);
  url.searchParams.set('key', STEAM_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API呼び出し失敗 (${interfaceName}/${method}): ${res.status}`);
  return res.json();
}

// プレイヤー情報。realname/位置情報(loccountrycode等)はPIIなので取得しても
// 出力には含めない(就活用ページで本名を伏せる方針と矛盾するため、2026-08-09本人確認)。
async function getPlayerSummary() {
  console.log('👤 プレイヤー情報を取得中...');
  const data = await steamGet('ISteamUser', 'GetPlayerSummaries', 'v2', { steamids: STEAM_ID });
  const player = data.response.players[0];
  return {
    personaname: player.personaname,
    avatarUrl: player.avatarfull,
    profileUrl: player.profileurl,
  };
}

async function getRecentlyPlayed() {
  console.log('🎮 最近プレイしたゲームを取得中...');
  const data = await steamGet('IPlayerService', 'GetRecentlyPlayedGames', 'v1', { steamid: STEAM_ID });
  const games = data.response.games || [];
  return games.map((g) => ({
    appid: g.appid,
    name: g.name,
    iconUrl: `${ICON_BASE}/${g.appid}/${g.img_icon_url}.jpg`,
    playtime2weeksMinutes: g.playtime_2weeks || 0,
    playtimeForeverMinutes: g.playtime_forever || 0,
  }));
}

async function getOwnedGames() {
  console.log('📚 所持ゲーム一覧を取得中...');
  const data = await steamGet('IPlayerService', 'GetOwnedGames', 'v1', {
    steamid: STEAM_ID,
    include_appinfo: 1,
    include_played_free_games: 1,
  });
  const games = (data.response.games || [])
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      iconUrl: g.img_icon_url ? `${ICON_BASE}/${g.appid}/${g.img_icon_url}.jpg` : null,
      playtimeForeverMinutes: g.playtime_forever || 0,
    }))
    .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes);
  return { count: data.response.game_count || games.length, games };
}

// 実績はゲームごとに「定義(表示名/説明/アイコン)」と「達成状況」を別々に
// 取ってマージする必要がある。実績非対応のゲームはエラーになるので個別に
// try/catchし、1本失敗しても全体を止めない。
async function getAchievementsForGame(appid, gameName) {
  try {
    const [schemaData, achData] = await Promise.all([
      steamGet('ISteamUserStats', 'GetSchemaForGame', 'v2', { appid }),
      steamGet('ISteamUserStats', 'GetPlayerAchievements', 'v1', { steamid: STEAM_ID, appid, l: 'japanese' }),
    ]);

    const schema = schemaData.game?.availableGameStats?.achievements;
    const playerAch = achData.playerstats?.achievements;
    if (!schema || !playerAch || achData.playerstats?.success === false) return null;

    const schemaByName = new Map(schema.map((a) => [a.name, a]));
    const unlocked = playerAch.filter((a) => a.achieved === 1);

    const recentUnlocks = unlocked
      .sort((a, b) => (b.unlocktime || 0) - (a.unlocktime || 0))
      .slice(0, 3)
      .map((a) => {
        const def = schemaByName.get(a.apiname);
        return {
          name: def?.displayName || a.apiname,
          description: def?.description || null,
          iconUrl: def?.icon || null,
          unlockedAt: new Date(a.unlocktime * 1000).toISOString(),
        };
      });

    return {
      appid,
      gameName,
      unlocked: unlocked.length,
      total: playerAch.length,
      recentUnlocks,
    };
  } catch (err) {
    console.log(`  ℹ️ ${gameName} (${appid}) は実績データを取得できませんでした: ${err.message}`);
    return null;
  }
}

async function getAchievements(topGames) {
  console.log(`🏆 実績を取得中(プレイ時間上位${ACHIEVEMENT_GAME_LIMIT}本)...`);
  const results = [];
  for (const game of topGames.slice(0, ACHIEVEMENT_GAME_LIMIT)) {
    const result = await getAchievementsForGame(game.appid, game.name);
    if (result && result.total > 0) results.push(result);
  }
  return results;
}

/**
 * 前回と中身が同じかどうか。Spotify/GitHub活動と同じ理由(lastUpdatedだけの
 * 差分で毎回コミットが積まれるのを防ぐ)。
 */
function isSameContent(prevPath, next) {
  if (!fs.existsSync(prevPath)) return false;
  try {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
    const strip = (d) => JSON.stringify({ ...d, lastUpdated: null });
    return strip(prev) === strip(next);
  } catch {
    return false;
  }
}

function writeJSON(data) {
  const outputPath = path.join(process.cwd(), 'public', 'steam-data.json');
  const docsPath = path.join(process.cwd(), 'docs', 'steam-data.json');

  if (isSameContent(outputPath, data)) {
    console.log('ℹ️  変更なし。ファイルは更新しません。');
    return { ...data, unchanged: true };
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  if (fs.existsSync(path.dirname(docsPath))) {
    fs.writeFileSync(docsPath, JSON.stringify(data, null, 2));
    console.log(`📁 JSONファイルを生成: ${docsPath}`);
  }
  console.log(`📁 JSONファイルを生成: ${outputPath}`);
  return data;
}

async function main() {
  try {
    console.log('🚀 Steamデータ更新を開始...');

    const player = await getPlayerSummary();
    const recentlyPlayed = await getRecentlyPlayed();
    const { count, games: library } = await getOwnedGames();
    const achievements = await getAchievements(library);

    const data = {
      lastUpdated: new Date().toISOString(),
      player,
      ownedGamesCount: count,
      recentlyPlayed,
      library,
      achievements,
    };

    const result = writeJSON(data);
    if (result.unchanged) {
      console.log('✅ 完了(変更なしのためコミットは発生しません)');
      return;
    }

    console.log('✅ Steamデータ更新完了!');
    console.log(`📊 所持ゲーム: ${count}本 / 実績データ: ${achievements.length}本分`);
  } catch (error) {
    console.error('❌ エラー:', error.message);
    process.exit(1);
  }
}

main();
