# nano-banana-chat-ui

画像をAIで編集できるチャット形式のWebアプリです。
画像をアップロードして「背景を青空にして」などと指示するだけで、AIが画像を自動で編集してくれます。

---

## このアプリの構成

```
ui/       → ブラウザで表示される画面（フロントエンド）
worker/   → AIへのリクエストを中継するサーバー（バックエンド）
```

---

## ローカルで動かす手順

### 準備するもの
- [Node.js](https://nodejs.org/) がインストールされていること
- Cloudflare のアカウント
- Google の Gemini API キー

---

### 1. サーバー（worker）の起動

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars
```

`.dev.vars` ファイルを開いて、以下の値を設定します：

```
GEMINI_API_KEY=あなたのGemini APIキー
PROXY_TOKEN=任意のパスワード（アクセス制限用）
```

起動：

```bash
npm run dev
```

---

### 2. 画面（ui）の起動

```bash
cd ui
npm install
cp .env.example .env
```

`.env` ファイルを開いて確認・編集します：

```
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_PROXY_TOKEN=
```

起動：

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開くとアプリが表示されます。

---

## 使い方

1. 右側の「Access Token」に `.dev.vars` で設定した `PROXY_TOKEN` を入力
2. 画像を添付ボタンから画像をアップロード
3. 編集したい内容を入力して送信（例：「背景を海にして」）
4. AIが編集した画像が表示されます

### System Prompt（システムプロンプト）
右側の「System Prompt」欄にAIへの基本指示を入力できます。
例：「被写体に一切の変更を加えないこと」「出力は必ず正方形にすること」など。
入力した内容はブラウザに自動保存されるので、次回アクセス時も引き継がれます。

### Before / After 比較
生成された画像の下にある「Before」「After」ボタンを使って、任意の2枚を比較できます。

1. 比較したい画像の「Before」をクリック（青くハイライト）
2. 別の画像の「After」をクリック（緑にハイライト）
3. 右側のSessionパネルに「比較する」ボタンが表示されるのでクリック
4. 比較モーダルが開き、ホイールでズーム・ドラッグで移動できます
5. もう一度同じボタンをクリックすると選択を解除できます

---

## 本番デプロイ（Cloudflare）

### サーバー（worker）のデプロイ

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put PROXY_TOKEN
npm run deploy
```

### 画面（ui）のデプロイ

Cloudflare Pages にリポジトリを連携してデプロイします。
ビルドコマンド：`npm run build`
出力ディレクトリ：`dist`
