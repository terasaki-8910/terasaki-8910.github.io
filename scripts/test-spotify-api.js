import dotenv from 'dotenv';
dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

console.log('🔧 認証情報チェック:');
console.log('CLIENT_ID:', CLIENT_ID ? '✅ 設定済み' : '❌ 未設定');
console.log('CLIENT_SECRET:', CLIENT_SECRET ? '✅ 設定済み' : '❌ 未設定');
console.log('REFRESH_TOKEN:', REFRESH_TOKEN ? '✅ 設定済み' : '❌ 未設定');

// Spotify APIテスト
async function testSpotifyAPI() {
  console.log('\n🧪 Spotify APIテスト...');

  try {
    // Base64エンコードの確認
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    console.log('Auth Header (最初10文字):', authHeader.substring(0, 10) + '...');

    // トークンリクエスト
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN
      })
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error Response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('Success Response:', data);

  } catch (error) {
    console.error('Network Error:', error);
  }
}

testSpotifyAPI();