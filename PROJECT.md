# Nano Banana Chat UI - プロジェクト概要

## 概要

Gemini APIを使った画像編集チャットUIです。画像をアップロードしてテキストで指示を出すと、AIが画像を編集して返してくれます。社内クリエイティブスタッフ向けに開発・運用されています。

---

## システム構成

```
[ユーザー（ブラウザ）]
        ↓ HTTPS
[AWS Amplify] - フロントエンドホスティング
        ↓ API呼び出し
[Lambda Function URL] - バックエンド（認証・APIプロキシ）
        ↓ JWT検証
[AWS Cognito] - ユーザー認証
        ↓ 画像生成リクエスト
[Google Gemini API] - 画像編集AI
```

---

## 技術スタック

### フロントエンド
- **フレームワーク**: React + Vite
- **UIライブラリ**: MUI (Material UI)
- **認証**: amazon-cognito-identity-js
- **デプロイ**: AWS Amplify

### バックエンド
- **実行環境**: AWS Lambda (Node.js 24.x)
- **エンドポイント**: Lambda Function URL（API Gatewayなし）
- **認証検証**: jose（JWT検証）
- **AI**: Google Gemini 3.1 Flash Image Preview

### インフラ
- **認証**: AWS Cognito（ユーザープール）
- **ホスティング**: AWS Amplify
- **バックエンド**: AWS Lambda + Lambda Function URL
- **リージョン**: ap-northeast-1（東京）

---

## 主要設定値

| 項目 | 値 |
|------|-----|
| Amplify URL | https://main.d3bki1v5h87gkr.amplifyapp.com |
| Cognito User Pool ID | ap-northeast-1_OJ1CWofYN |
| Cognito Client ID | ohpv7vtps44nfbv8s9qa2hed |
| Lambda Function URL | https://mqoskkhk6qq4hoq2rdtj7yfvuy0bwjqo.lambda-url.ap-northeast-1.on.aws |
| Lambda メモリ | 512MB |
| Lambda タイムアウト | 5分 |
| Gemini タイムアウト | 5分（コード内 GEMINI_TIMEOUT_MS） |

---

## ディレクトリ構成

```
nano-banana-chat-ui/
├── ui/                        # フロントエンド（React + Vite）
│   ├── src/
│   │   ├── App.jsx            # メインアプリ（チャットUI）
│   │   ├── main.jsx           # エントリーポイント・テーマ設定
│   │   ├── auth.js            # Cognito認証ロジック
│   │   └── LoginPage.jsx      # ログイン画面
│   ├── .env                   # 環境変数（APIエンドポイント・Cognito設定）
│   └── vite.config.js         # Vite設定（global polyfill含む）
├── lambda/
│   ├── index.mjs              # Lambdaメイン処理（JWT検証・Gemini呼び出し）
│   ├── package.json           # 依存関係（jose）
│   └── function.zip           # Lambda手動アップロード用zip
└── worker/                    # 旧Cloudflare Worker（現在未使用）
```

---

## デプロイ方法

### フロントエンド（自動）
```
GitHub main ブランチにpush → AWS Amplifyが自動ビルド・デプロイ
```
※ 自動デプロイが詰まる場合はAmplifyコンソールから手動で「デプロイを実行」

### バックエンド（手動）
```
1. lambda/ フォルダで zip を作成
2. Lambda コンソール → nano-banana-worker → コードをアップロード
```

---

## 認証フロー

1. ユーザーがメール＋パスワードでログイン
2. Cognito がJWTトークンを発行
3. フロントエンドがAPIリクエスト時に `Authorization: Bearer {token}` を付与
4. LambdaがCognitoの公開鍵でJWTを検証
5. 検証OK → Gemini APIにリクエスト転送

---

## 環境変数

### フロントエンド（Amplify 環境変数 / ui/.env）
| 変数名 | 説明 |
|--------|------|
| VITE_API_BASE_URL | Lambda Function URL |
| VITE_COGNITO_USER_POOL_ID | CognitoユーザープールID |
| VITE_COGNITO_CLIENT_ID | CognitoクライアントID |

### バックエンド（Lambda 環境変数）
| 変数名 | 説明 |
|--------|------|
| GEMINI_API_KEY | Google AI Studio APIキー |
| COGNITO_USER_POOL_ID | JWT検証用プールID |
| COGNITO_CLIENT_ID | JWT検証用クライアントID |
| ALLOWED_ORIGINS | CORSで許可するオリジン |

---

## 現在の進捗

### 完了済み
- [x] Cloudflare Workers → AWS Lambda + Lambda Function URL 移行
- [x] AWS Amplify へのフロントエンドデプロイ
- [x] AWS Cognito によるメール＋パスワード認証
- [x] 画像アップロード（クリック・ドラッグ＆ドロップ）
- [x] システムプロンプト（ユーザーごとにlocalStorageで保存）
- [x] Before/After 比較モーダル
- [x] エラーメッセージの日本語化・詳細化
- [x] 画像サイズ最適化（縦横比維持、余白なし）
- [x] API Gatewayの29秒タイムアウト問題を解消（Lambda Function URLへ移行）
- [x] Lambdaタイムアウトを5分に延長

### 残課題・今後の検討事項
- [ ] エラーメッセージの二重表示を解消
- [ ] Zohoアカウント認証への移行（工数: 約5〜8時間）
- [ ] Session枠のドラッグリサイズ
- [ ] 比較画面UIの統一
- [ ] Amplify 自動デプロイが詰まる問題の根本解決

---

## 料金概算（月額）

| サービス | 月額 |
|---------|------|
| AWS Lambda | 無料（無料枠内） |
| AWS Amplify | 無料（無料枠内） |
| AWS Cognito | 無料（5万MAUまで） |
| Google Gemini API | 約¥44,000〜¥175,000（利用頻度による） |

※ Gemini料金: $0.067/枚（1K解像度）× 利用回数
※ 40人・1日20回想定: 約¥175,000/月

---

## 注意事項

- `lambda/function.zip` と `lambda/node_modules/` はGitignore対象（`.env`も同様）
- Gemini 3.1 Flash Image Preview は「Preview」ステータスのモデルのため、将来廃止・変更の可能性あり
- Amplifyの自動デプロイが詰まった場合はキャンセルして再実行
- Lambda Function URLのBUFFEREDモードは6MBレスポンス制限あり（大きい画像で問題になる可能性）
