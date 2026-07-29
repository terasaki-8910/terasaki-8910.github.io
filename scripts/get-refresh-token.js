import dotenv from 'dotenv';
import fs from 'fs';
import { execFileSync } from 'child_process';
dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'https://terasaki-8910.github.io/callback.html'; // GitHub PagesのURL

// スコープ：最近再生した曲を読み取る権限
const SCOPES = 'user-read-recently-played';

// Step 1: 認証URLを生成
function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: Math.random().toString(36).substring(7), // セキュリティ用ランダム文字列
    // 既存の許可が残っていても必ず同意画面を出す。黙って古い認可を使い回されると
    // 「再認可したのに直らない」状態になりやすいため。
    show_dialog: 'true'
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Step 2: 認証コードをトークンに交換
async function exchangeCodeForTokens(code) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI
    })
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 取得したリフレッシュトークンをGitHub Secretsへ直接書き込む。
 * 画面には出さない —— 端末のスクロールバックやログに残さないため
 * （以前は console.log で表示していた）。
 */
function saveToGitHubSecrets(refreshToken) {
  execFileSync('gh', ['secret', 'set', 'SPOTIFY_REFRESH_TOKEN'], {
    input: refreshToken,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/** ローカル実行用に .env の SPOTIFY_REFRESH_TOKEN も差し替える（あれば）。 */
function updateDotEnv(refreshToken) {
  const envPath = '.env';
  if (!fs.existsSync(envPath)) return false;
  const body = fs.readFileSync(envPath, 'utf-8');
  if (!/^SPOTIFY_REFRESH_TOKEN=/m.test(body)) return false;
  fs.writeFileSync(envPath, body.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, `SPOTIFY_REFRESH_TOKEN=${refreshToken}`));
  return true;
}

/** URL全体を渡されても code だけ渡されても認証コードを取り出す。 */
function extractCode(input) {
  const s = input.trim().replace(/^["']|["']$/g, '');
  if (s.includes('code=')) {
    try {
      return new URL(s).searchParams.get('code') ?? '';
    } catch {
      return new URLSearchParams(s.slice(s.indexOf('?') + 1)).get('code') ?? '';
    }
  }
  return s;
}

async function redeem(input) {
  const code = extractCode(input);
  if (!code) throw new Error('認証コードを読み取れませんでした');

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) throw new Error('レスポンスに refresh_token が含まれていません');

  console.log('\n✅ トークン取得成功（値は表示しません）');
  saveToGitHubSecrets(tokens.refresh_token);
  console.log('✅ GitHub Secrets の SPOTIFY_REFRESH_TOKEN を更新しました');
  if (updateDotEnv(tokens.refresh_token)) {
    console.log('✅ ローカルの .env も更新しました');
  }
  console.log('\n次のコマンドで復旧を確認できます:');
  console.log('  gh workflow run update-spotify.yml');
}

// 実行。
// 引数でリダイレクト後のURL(またはcode)を渡せば非対話で完了する。
// 対話プロンプトは端末が無い環境(CI・エディタ統合ターミナルの一部)で
// 入力を受け取れず固まるため、引数渡しを既定の手順にしている。
const arg = process.argv[2];

if (arg) {
  redeem(arg).catch((error) => {
    console.error('❌ エラー:', error.message);
    process.exitCode = 1;
  });
} else {
  console.log('=== Spotify Refresh Token 再取得 ===\n');
  console.log('1. 以下のURLをブラウザで開き、Spotifyにログインして許可してください:\n');
  console.log(getAuthUrl());
  console.log('\n2. 許可すると callback.html にリダイレクトされます。');
  console.log('   そのアドレスバーのURL全体をコピーし、次を実行してください:\n');
  console.log('   node scripts/get-refresh-token.js "<リダイレクト後のURL>"\n');
  console.log('   例: node scripts/get-refresh-token.js "https://terasaki-8910.github.io/callback.html?code=XXXX&state=YYYY"');
  console.log('\n   ※ 認証コードは1回限り・数分で失効します。取得したらすぐ実行してください。');
}