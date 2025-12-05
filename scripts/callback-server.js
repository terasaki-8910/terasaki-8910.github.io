import http from 'http';
import url from 'url';

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/callback') {
    const code = parsedUrl.query.code;
    const error = parsedUrl.query.error;

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body>
            <h1>認証エラー</h1>
            <p>エラー: ${error}</p>
            <p>もう一度お試しください。</p>
          </body>
        </html>
      `);
      return;
    }

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body>
            <h1>✅ 認証成功！</h1>
            <p>認証コードをコピーしてください:</p>
            <input type="text" value="${code}" size="80" readonly onclick="this.select()">
            <br><br>
            <p>このコードをターミナルに貼り付けてください。</p>
            <button onclick="window.close()">このウィンドウを閉じる</button>
          </body>
        </html>
      `);

      console.log(`\n🎉 認証コード: ${code}`);
      console.log('上記のコードをターミナルに貼り付けてください。');
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>認証コードが見つかりません</h1>');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 コールバックサーバーがポート${PORT}で起動しました`);
  console.log(`http://localhost:${PORT}/callback で待機中...`);
});

// 30秒後に自動終了
setTimeout(() => {
  console.log('⏰ サーバーを終了します...');
  server.close();
}, 30000);