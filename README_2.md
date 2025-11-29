# クソサイト製造工場

> 無駄に洗練されたハイテク工場

[![Deploy to GitHub Pages](https://github.com/terasaki-8910/terasaki-8910.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/terasaki-8910/terasaki-8910.github.io/actions/workflows/deploy.yml)

## 🚀 概要

実験的なWebプロジェクトの集積地。Apple製品ページに匹敵する没入感と美学を持つシングルページアプリケーション。

**Live Site:** [https://terasaki-8910.github.io](https://terasaki-8910.github.io)

## ✨ 特徴

- **圧倒的なビジュアル体験**
  - Three.jsによるリアルタイム3Dジェネレーティブアート
  - GSAPとScrollTriggerによる映画的なスクロールアニメーション
  - Lenisによる滑らかな慣性スクロール

- **モダンなテックスタック**
  - React 18 + Vite
  - Tailwind CSS
  - Three.js / React Three Fiber
  - GSAP 3

- **パフォーマンス最適化**
  - 静的サイト生成
  - GitHub Pages対応
  - レスポンシブデザイン

## 🛠️ セットアップ

### 必要要件

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# プロダクションビルド
npm run build

# ビルドのプレビュー
npm run preview
```

## 📁 プロジェクト構造

```
terasaki-8910.github.io/
├── src/
│   ├── components/
│   │   ├── Hero.jsx              # ヒーローセクション
│   │   ├── Philosophy.jsx        # 哲学セクション
│   │   ├── ProjectShowcase.jsx   # プロジェクト紹介
│   │   ├── Profile.jsx           # プロフィール
│   │   ├── Footer.jsx            # フッター
│   │   └── BackgroundScene.jsx   # Three.js背景
│   ├── App.jsx                   # メインアプリケーション
│   ├── main.jsx                  # エントリーポイント
│   └── index.css                 # グローバルスタイル
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions設定
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 🎨 デザインシステム

### カラーパレット

- **Rich Black** (`#0A0E27`) - メインの背景色
- **Deep Navy** (`#151B36`) - セクション背景
- **Accent Cyan** (`#00D9FF`) - アクセントカラー
- **Accent Violet** (`#8B5CF6`) - サブアクセント

### タイポグラフィ

- **Font Family**: SF Pro Display, システムフォント
- **Hero Size**: clamp(3rem, 15vw, 12rem)
- **Massive Size**: clamp(2rem, 8vw, 6rem)

## 🚢 デプロイ

GitHub Actionsによる自動デプロイが設定されています。

1. `main`ブランチへのプッシュ
2. 自動的にビルド・デプロイが実行
3. GitHub Pagesで公開

## 📝 ライセンス

© 2024 terasaki-8910.github.io

## 🙏 クレジット

- **GSAP** - アニメーションライブラリ
- **Three.js** - 3Dグラフィックス
- **React Three Fiber** - Three.jsのReactレンダラー
- **Lenis** - スムーススクロールライブラリ
- **Tailwind CSS** - ユーティリティファーストCSSフレームワーク