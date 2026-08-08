import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ProjectMenu.jsx(React)の静的HTML版。spotify/index.htmlはReactの状態を
 * 持てないため、開閉はvanilla JS(このファイル末尾のscriptタグ内、
 * #project-menu-trigger/#project-menu-panel)で再現する。
 * src/data/projects.js の一覧を変更したらここも手動で合わせること。
 */
const STATIC_PROJECT_MENU_HTML = `<div class="cosmic-header__menu">
    <button type="button" id="project-menu-trigger" class="cosmic-header__menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="プロジェクトメニュー">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="cosmic-header__icon">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
    </button>
    <div id="project-menu-panel" class="cosmic-header__menu-panel" role="menu" hidden>
    <a href="/spotify/" role="menuitem" class="cosmic-header__menu-item cosmic-header__menu-item--active">
    <span class="cosmic-header__menu-item-icon">
    <svg viewBox="0 0 24 24" fill="currentColor" class="spotify-logo">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
    </span>
    <span>Spotify Dashboard</span>
    </a>
    <a href="/gomi-tsukuba/" role="menuitem" class="cosmic-header__menu-item">
    <span>Tsukuba Gomi Calendar</span>
    </a>
    <a href="/chara-picker/" role="menuitem" class="cosmic-header__menu-item">
    <span>理想の推しア◯ネイター</span>
    </a>
    <a href="#" role="menuitem" class="cosmic-header__menu-item">
    <span>Gaming Archive</span>
    </a>
    </div>
    </div>`;

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
    jsx = jsx.replace(/className=\{`cosmic-header__home-link \${currentPage === 'home' \? 'cosmic-header__home-link--active' : ''}`\}/g, 'class="cosmic-header__home-link"');

    // target属性を処理
    jsx = jsx.replace(/target=\{currentPage === 'spotify' \? '_self' : '_blank'\}/g, 'target="_self"');

    // <ProjectMenu currentPage={currentPage} /> はReactコンポーネント。
    // 下の汎用「{...}を消す」置換にそのままかけると壊れたタグ
    // (<ProjectMenu  />、ブラウザは未知要素として無視するだけで何も
    // 表示されない)が出力されてしまう。spotify/index.htmlはReactの状態を
    // 持てない静的ページなので、開閉挙動はvanilla JS側で別途実装している
    // (このファイル末尾のscriptタグ、#project-menu-trigger/#project-menu-panel)。
    // ここではそのvanilla JSが操作する対象と同じ構造の静的マークアップに
    // 置き換える(currentPage='spotify'固定なのでSpotify項目をactive表示に
    // 決め打ちする)。src/data/projects.js の内容を変更したら、この
    // STATIC_PROJECT_MENU_HTML も手動で追従させること(自動生成ではない)。
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

      // 新しいヘッダーHTMLを構築
      const updatedContent = beforeHeader +
        '<!-- ヘッダー -->\n    ' +
        newHeaderHtml + '\n\n' +
        afterHeader;

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
syncer.sync().catch(console.error);

export default HeaderSyncer;