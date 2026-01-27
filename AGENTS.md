# AGENTS.md

## プロジェクト構成とモジュール整理

```
.
├── src/
│   ├── app.ts            # Slack Boltアプリのエントリーポイント
│   ├── handlers/         # イベント処理
│   ├── listeners/        # handlersの登録
│   ├── services/         # 外部連携の調整役
│   ├── externals/        # esaやGeminiのクライアントラッパー
│   ├── ui/               # Block Kitペイロード管理
│   ├── dto/              # 共通の型定義
│   └── util/             # 共通ヘルパー
├── __tests__/            # 実行時ディレクトリ構成のミラー
├── docs/                 # README参照アセット
└── dist/                 # TypeScriptビルド後の成果物
```

参考:

- Slack Bolt: https://slack.dev/bolt-js/

## ビルド・テスト・開発コマンド

- `pnpm test` でテストを実行。開発時は必ず利用する
- `pnpm lint` と `pnpm lint-fix` はBiomeのルールを適用し、`npm run check-fix`でフォーマットとimport整理を行う

参考:

- Jest: https://jestjs.io/
- Biome: https://biomejs.dev/

## コーディングスタイルと命名規約

- TypeScriptは`strict`設定でコンパイルされるため、強い型付けを維持し`any`の使用は避ける
- Biomeにより、タブインデント、ダブルクォート、importの整理、未使用importの禁止が強制される。プッシュ前にlintを実行すること
- クラスやサービスは PascalCase、関数や変数は camelCase、環境変数キーは大文字のスネークケースを用いる
- 新規ファイルは主要なexport名に合わせて命名する（例: `gemini-answer-service.ts`、`app-mention.ts`）。テストは同じ名前を利用し、
  `__tests__`配下に隣接配置する
- SOLID原則に従った設計と実装をする
- 関数の引数が3つ以上になる場合はコマンドパターンを利用する

## テスト

- 新機能追加時は、正常系と失敗系の両方をカバーするユニットテストを作成する
- ロジックは可能な限り決定的に保ち、ネットワーク呼び出しは`externals`レイヤーでスタブする。Slackのペイロード形状は既存のフィクスチャで検証する

## コミットおよびPull Requestのガイドライン

- Conventional Commitsに従う。なぜ、目的を主としたメッセージとすること
- ローカルでlint・build・testがすべて通ることを確認し、設定変更や環境変数追加がある場合はPR説明に明記する
