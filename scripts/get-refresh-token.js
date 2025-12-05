import dotenv from 'dotenv';
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
    state: Math.random().toString(36).substring(7) // セキュリティ用ランダム文字列
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

// 実行
console.log('=== Spotify Refresh Token 取得 ===\n');
console.log('1. 以下のURLをブラウザで開いてください:');
console.log(getAuthUrl());
console.log('\n2. 認証後、リダイレクト先のURLから認証コードをコピーしてください');
console.log('   URL例: http://localhost:3000/callback?code=AUTH_CODE_HERE&state=...\n');

// Node.jsの場合は手動で認証コードを入力
import readline from 'readline';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('認証コードを入力してください: ', async (code) => {
  try {
    const tokens = await exchangeCodeForTokens(code);

    console.log('\n✅ トークン取得成功！');
    console.log('\n📝 GitHub Secretsに保存してください:');
    console.log(`SPOTIFY_REFRESH_TOKEN: ${tokens.refresh_token}`);
    console.log(`(初回アクセストークン: ${tokens.access_token})`);
    console.log(`(有効期限: ${tokens.expires_in}秒)`);

  } catch (error) {
    console.error('❌ エラー:', error.message);
  }

  rl.close();
});