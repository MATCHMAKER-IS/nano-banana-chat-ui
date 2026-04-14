# nano-banana-chat-ui

画像をAIで編集できるチャット形式のWebアプリです。
画像をアップロードして「背景を青空にして」などと指示するだけで、AIが画像を自動で編集してくれます。

---

## 構成

```
ui/       → ブラウザで表示される画面（React + Vite）
lambda/   → AIへのリクエストを処理するサーバー（AWS Lambda）
```

### インフラ構成

| 役割 | サービス |
|------|----------|
| フロントエンドホスティング | AWS Amplify |
| 認証 | AWS Cognito |
| バックエンドAPI | AWS Lambda（Function URL） |
| AIモデル | Google Gemini API |

---

## ローカルで動かす手順

### 準備するもの
- [Node.js](https://nodejs.org/) がインストールされていること
- Google の Gemini API キー
- AWS Cognito のユーザープールID・クライアントID

---

### 1. 画面（ui）の起動

```bash
cd ui
npm install
cp .env.example .env
```

`.env` を編集して以下を設定します：

```
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

起動：

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開くとアプリが表示されます。

---

## 使い方

1. Cognitoアカウントでログイン
2. 左下のボタンまたはドラッグ＆ドロップで画像を追加
3. 編集したい内容を入力して送信（例：「背景を海にして」）
4. AIが編集した画像が表示されます
5. 続けて指示を入力すると、生成された画像をさらに編集できます

### 固定指示（システムプロンプト）
右側の「固定指示」欄にAIへの共通指示を入力できます。毎回の編集に共通して適用されます。
例：「被写体に一切の変更を加えないこと」など。
入力した内容はブラウザに自動保存されます。

### 編集前後の比較
生成された画像の下にある「編集前後を比較」ボタンでスライダー比較ができます。

---

## デプロイ手順

### フロントエンド（AWS Amplify）

GitHubのmainブランチにpushすると自動でデプロイされます。
（自動デプロイが無効の場合はAmplifyコンソールから手動でデプロイ）

環境変数はAmplifyコンソール → 環境変数で設定してください。

### バックエンド（AWS Lambda）

```bash
cd lambda
zip -r function.zip index.mjs
```

作成した `function.zip` をAWSコンソール → Lambda → 関数 → コードのアップロードから手動でアップロードします。
