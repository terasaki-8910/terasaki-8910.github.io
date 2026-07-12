import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    jsx = jsx.replace(/className=\{`cosmic-header__spotify-link \${currentPage === 'spotify' \? 'cosmic-header__spotify-link--active' : ''}`\}/g, 'class="cosmic-header__spotify-link cosmic-header__spotify-link--active"');

    // target属性を処理
    jsx = jsx.replace(/target=\{currentPage === 'spotify' \? '_self' : '_blank'\}/g, 'target="_self"');

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