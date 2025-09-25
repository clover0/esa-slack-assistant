# esa Slack Assistant

esa Slack Assistantは、ナレッジシェアリングプラットフォームである[esa](https://esa.io/)とSlackを連携し、Slack上から質問してesaの記事を利用してAIが回答するSlackアプリケーションです。


# 始め方

## Slack アプリの作成
1. [Slack API](https://api.slack.com/apps)にアクセスし、「Create New App」からAppを作成
2. 「From a manifest」を選択し、インストールするワークスペースを選択
3. 「YAML」に[app_manifest.deploy.yml](app_manifest.deploy.yml)の内容を貼り付け、「Create App」。※nameなどは適宜変更してください。
4. 「Install App」よりワークスペースにインストール


## esa API トークンの取得
1. 「Settings」のAPI設定より「パーソナルアクセストークン v2」を発行します。スコープは `read:post`, `read:category`です。


## アプリのデプロイ
Websocketモードで動作するため常時稼働するタイプなら問題ありません。

以下の環境変数を設定します。
```
SLACK_BOT_TOKEN= <OAuth & Permissions > OAuth Tokens>
SLACK_APP_TOKEN= <Basic Infomation > App-Level Tokens > Generate an app-level token. Scope: "connections:write">
SLACK_SIGNING_SECRET=<Basic Infomation > Signing Secret>

ESA_API_KEY=<your_esa_api_key>
ESA_TEAM_NAME=<your_team_name>

GOOGLE_CLOUD_PROJECT_ID=<project-id>
GOOGLE_CLOUD_LOCATION=<us-central1>
```


### Google Cloud Run
minimum instancesを1に設定してください。


### その他
...
