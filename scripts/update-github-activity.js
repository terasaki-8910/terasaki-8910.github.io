import fs from 'fs';
import path from 'path';

// dotenvを設定
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

// 環境変数から認証情報を取得
const TOKEN = process.env.GH_CONTRIB_TOKEN;

if (!TOKEN) {
  console.error('❌ 必要な環境変数が設定されていません (GH_CONTRIB_TOKEN)');
  process.exit(1);
}

// GitHub GraphQL APIからコントリビューションデータを取得
async function getContributions() {
  console.log('🔄 GitHubのコントリビューションデータを取得中...');

  const query = `
    query {
      viewer {
        login
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('🔍 APIエラー詳細:', errorText);
    throw new Error(`GitHub API呼び出し失敗: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors) {
    console.error('🔍 GraphQLエラー:', json.errors);
    throw new Error('GitHub GraphQL APIがエラーを返しました');
  }

  console.log('✅ コントリビューションデータ取得成功');
  return json.data.viewer;
}

// データを整形
function formatData(viewer) {
  const calendar = viewer.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap((week) => week.contributionDays);

  return {
    lastUpdated: new Date().toISOString(),
    login: viewer.login,
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks,
    days,
  };
}

// JSONファイルを生成
function generateJSON(data) {
  const outputPath = path.join(process.cwd(), 'public', 'github-activity.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  const docsPath = path.join(process.cwd(), 'docs', 'github-activity.json');
  fs.writeFileSync(docsPath, JSON.stringify(data, null, 2));
  console.log(`📁 JSONファイルを生成: ${outputPath}`);
  console.log(`📁 JSONファイルを生成: ${docsPath}`);
}

// メイン処理
async function main() {
  try {
    console.log('🚀 GitHub活動データ更新を開始...');

    const viewer = await getContributions();
    const data = formatData(viewer);
    generateJSON(data);

    console.log('✅ GitHub活動データ更新完了!');
    console.log(`📊 直近1年の合計コントリビューション: ${data.totalContributions}`);
    console.log(`⏰ 更新時刻: ${data.lastUpdated}`);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

main();
