import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { projects } from '../src/data/projects.js';
import { renderProjectMenu } from '../src/data/projectMenuMarkup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ProjectMenu.jsx(React)の静的HTML版。React のページと同じ関数
 * (src/data/projectMenuMarkup.js)で、src/data/projects.js から作る。開閉の動きも
 * React のページと同じ src/fx/projectMenu.js を、spotify/index.html の
 * <script type="module" src="/src/fx/projectMenuStatic.js"> が読み込む。
 * 静的ページは currentPage='spotify' 固定(Spotify の行が「今いるページ」になる)。
 */
const STATIC_PROJECT_MENU_HTML = `<div class="cosmic-header__menu">${renderProjectMenu(projects, 'spotify')}</div>`;

/**
 * ヘッダーコンポーネントを自動同期するスクリプト
 * Header.jsxの変更をspotify_recent.htmlに自動反映
 */

class HeaderSyncer {
  constructor() {
    this.headerPath = path.join(__dirname, '../src/components/Header.jsx');
    this.spotifyHtmlPath = path.join(__dirname, '../spotify/index.html');
    this.sharedCssPath = path.join(__dirname, '../public/header-styles.css');
    this.headerCssPath = path.join(__dirname, '../src/components/Header.css');
  }

  /**
   * JSXからHTML構造を抽出
   */
  extractHtmlStructure() {
    try {
      const headerContent = fs.readFileSync(this.headerPath, 'utf8');

      // JSXのreturn文を抽出
      const returnMatch = headerContent.match(/return\s*\(\s*([\s\S]*?)\s*\)/);
      if (!returnMatch) {
        throw new Error('JSX return statement not found');
      }

      let jsxStructure = returnMatch[1];
      // 中身が空なら、画面の部分ではない「return (」に当たっている(例: return () => ...)。黙って止まらず知らせる
      if (!jsxStructure.trim().startsWith('<')) {
        throw new Error('Header.jsx の最初の「return (」が画面の部分ではありません。ほかの場所で「return (」と書かないこと');
      }

      // JSXをHTMLに変換
      let htmlStructure = this.convertJsxToHtml(jsxStructure);

      return htmlStructure;
    } catch (error) {
      console.error('Error extracting HTML structure:', error);
      return null;
    }
  }

  /**
   * JSX構文をHTMLに変換
   */
  convertJsxToHtml(jsx) {
    // //コメントは保持
    jsx = jsx.replace(/{\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*+\/}/g, (match) => {
      return match.replace(/\/\*/g, '<!--').replace(/\*\//g, '-->');
    });

    // Spotifyページ用のHTMLを直接構築（currentPage='spotify'固定）
    // テンプレートリテラル内の条件分岐を解決
    // 左上のロゴ: Spotify ページはトップではないので、常に出す
    jsx = jsx.replace(/className=\{`cosmic-header__logo \${logoHidden \? 'cosmic-header__logo--hidden' : ''}`\}/g, 'class="cosmic-header__logo"');

    // target属性を処理
    jsx = jsx.replace(/target=\{currentPage === 'spotify' \? '_self' : '_blank'\}/g, 'target="_self"');

    // <ProjectMenu currentPage={currentPage} /> はReactコンポーネント。下の汎用「{...}を消す」
    // 置換にそのままかけると壊れたタグになるので、同じマークアップの静的HTMLに置き換える。
    jsx = jsx.replace(/<ProjectMenu[^/]*\/>/, STATIC_PROJECT_MENU_HTML);

    // className → class
    jsx = jsx.replace(/className=/g, 'class=');

    // 残りのJSX式を削除(onClick={handleThemeToggle}のような、静的HTMLでは
    // 意味を持たないイベントハンドラ属性)
    jsx = jsx.replace(/\{[^}]*\}/g, '');

    // 上の置換で "onClick=" のように属性名+"="だけが値なしで残ることがある。
    // parse5(Viteのビルド時HTMLパーサー)はこれを構文エラーとして拒否するため、
    // 属性名ごと丸ごと除去する。
    jsx = jsx.replace(/\s+[a-zA-Z-]+=(?=\s|\/?>)/g, '');

    // 属性のクォートを正規化
    jsx = jsx.replace(/(\w+)=([^"\s>]+)"/g, '$1="$2"');

    // 余分なスペースをクリーンアップ（改行を保持）
    jsx = jsx.replace(/>\s+</g, '>\n    <');

    return jsx.trim();
  }

  /**
   * CSSを共有ファイルに同期
   */
  syncCss() {
    try {
      const headerCss = fs.readFileSync(this.headerCssPath, 'utf8');
      fs.writeFileSync(this.sharedCssPath, headerCss);
      console.log('✅ CSSを共有ファイルに同期しました');
      return true;
    } catch (error) {
      console.error('❌ CSS同期エラー:', error);
      return false;
    }
  }

  /**
   * spotify_recent.htmlのヘッダーを更新
   */
  updateSpotifyHtml(newHeaderHtml) {
    try {
      const spotifyContent = fs.readFileSync(this.spotifyHtmlPath, 'utf8');

      // 既存のヘッダーを検索して置換
      const headerStartRegex = /<!-- ヘッダー -->/;
      const headerEndRegex = /<\/header>/;

      const headerStartMatch = spotifyContent.match(headerStartRegex);
      if (!headerStartMatch) {
        throw new Error('Header section not found in spotify_recent.html');
      }

      const beforeHeader = spotifyContent.substring(0, headerStartMatch.index);
      const afterHeaderMatch = spotifyContent.substring(headerStartMatch.index);

      const headerEndMatch = afterHeaderMatch.match(headerEndRegex);
      if (!headerEndMatch) {
        throw new Error('Header end tag not found');
      }

      const afterHeader = afterHeaderMatch.substring(headerEndMatch.index + headerEndMatch[0].length);

      // 新しいヘッダーHTMLを構築。ヘッダーの後ろの空の行は1つにそろえる
      // (以前は '\n\n' を足すだけで、走らせるたびに空の行が増えていた)
      const updatedContent = beforeHeader +
        '<!-- ヘッダー -->\n    ' +
        newHeaderHtml + '\n\n' +
        afterHeader.replace(/^(\s*\n)+/, '');

      fs.writeFileSync(this.spotifyHtmlPath, updatedContent);
      console.log('✅ spotify_recent.htmlのヘッダーを更新しました');
      return true;
    } catch (error) {
      console.error('❌ HTML更新エラー:', error);
      return false;
    }
  }

  /**
   * CSS参照を更新（古いヘッダーCSSを削除）
   */
  updateCssReferences() {
    try {
      const spotifyContent = fs.readFileSync(this.spotifyHtmlPath, 'utf8');

      // ヘッダーCSSセクションを検索
      const headerCssStart = spotifyContent.indexOf('/* ヘッダースタイル */');
      const headerCssEnd = spotifyContent.indexOf('/* コンテンツの上部余白を調整 */');

      if (headerCssStart !== -1 && headerCssEnd !== -1) {
        const beforeCss = spotifyContent.substring(0, headerCssStart);
        const afterCss = spotifyContent.substring(headerCssEnd);

        // 古いヘッダーCSSセクションを削除
        const updatedContent = beforeCss + afterCss;
        fs.writeFileSync(this.spotifyHtmlPath, updatedContent);
        console.log('✅ 古いヘッダーCSSセクションを削除しました');
      }

      return true;
    } catch (error) {
      console.error('❌ CSS参照更新エラー:', error);
      return false;
    }
  }

  /**
   * 全同期を実行
   */
  async sync() {
    console.log('🔄 ヘッダー同期を開始します...');

    // 1. CSSを同期
    const cssSynced = this.syncCss();
    if (!cssSynced) return false;

    // 2. HTML構造を抽出
    const newHeaderHtml = this.extractHtmlStructure();
    if (!newHeaderHtml) return false;

    // 3. HTMLを更新
    const htmlUpdated = this.updateSpotifyHtml(newHeaderHtml);
    if (!htmlUpdated) return false;

    // 4. CSS参照を更新
    this.updateCssReferences();

    console.log('✅ ヘッダー同期が完了しました！');
    return true;
  }
}

// スクリプト実行
const syncer = new HeaderSyncer();
// 途中で止まったら、失敗として終わる(以前は CSS だけ写して黙って終わっていた)
syncer.sync().then((ok) => {
  if (!ok) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export default HeaderSyncer;