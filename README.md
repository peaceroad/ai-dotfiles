# ai-dotfiles

Codexの設定例と、AIエージェントに仕事を頼むためのスキルを公開している個人用dotfilesリポジトリです。スキルやプラグインの開発・配布、Codexの保守に使う `agent` コマンドも提供しています。それぞれ必要なものだけ利用できます。

- [用途からプラグインを選ぶ](#用途からプラグインを選ぶ) — AIにプロンプトを書いてもらう、繰り返し作業を設計する、スキルを評価する。
- [Codexの設定例を読む](#codexの設定例) — 設定ファイルや共通指示を開き、その項目を採用した理由を調べる。
- [agentコマンドを導入する](#agentコマンド) — ターミナルからスキルを管理・配布する、Codexの履歴を整理する。

特定の症状への対処や過去の設計判断を探すときは、[目的別の文書ガイド](docs/README.md)からたどれます。

## 用途からプラグインを選ぶ

スキルは、特定の仕事を依頼したときにエージェントが読む指示です。このリポジトリでは、関連するスキルやツールをAgent Plugins v1形式のプラグインにまとめています。

プラグイン名から導入方法と使い方を、各スキル名からエージェントが読む指示本文（`SKILL.md`）を確認できます。

### プロンプトや作業手順を設計する

[agent-design-tools](plugins/agent-design-tools/README.md) は、エージェントに何をどう頼むかを設計するためのプラグインです。単発の依頼文から、複数の担当が引き継ぐ作業手順まで扱い、Gemini向けの指示や生成プロンプトにも対応します。

- [prompt-design](plugins/agent-design-tools/skills/prompt-design/SKILL.md) は、依頼文や `AGENTS.md`、スキルの指示を作成・レビューします。たとえば「元の要件を保ったまま、出力形式が明確になるように書き直して」と頼めます。Codexで利用先を指定せずにプロンプト作成を頼むと、GPT-6.2 Astra向けに設計します。GPT-6.2 Solや従来のGPT-6 Astraなど、利用先が決まっていればそちらを優先します。
- [agent-workflow-design](plugins/agent-design-tools/skills/agent-workflow-design/SKILL.md) は、定期作業や長時間の作業について、誰が何を担当し、どの結果を待ち、中断後にどこから再開するかを設計します。ワークフロー全体のモデルは固定せず、委任先のモデルを選べる場合は、仕事の難しさや必要な能力を考慮します。
- [gemini-instruction-design](plugins/agent-design-tools/skills/gemini-instruction-design/SKILL.md) は、Gemini Appsのスキル、Gemini CLI・Antigravity・APIに渡す指示、画像・動画の生成や編集に使うプロンプトを作ります。利用する製品と欲しい成果物を伝えると、それに合う形式で指示をまとめます。

`prompt-design` のモデル指定は、作成する指示の設計基準です。実行中のモデルは利用先の設定で決まります。[対象モデルの選び方](plugins/agent-design-tools/README.md#model-targeting) · [依頼例で見るスキルの使い分け](docs/prompt-design/skill-creator-prompt-design-agent-workflow-design.md#具体的な依頼での選び方)

### スキルの変更に効果があったか確かめる

[agent-eval-tools](plugins/agent-eval-tools/README.md) は、スキルやプラグインの変更を採用するか、実行結果をもとに判断するためのプラグインです。評価手順を案内するスキルと、同じ課題へのテキスト応答を比較するランナーを収録しています。

- [agent-improve](plugins/agent-eval-tools/skills/agent-improve/SKILL.md) は、スキルやプラグインの変更前後に同じ課題を試し、改善した点と、これまでできていたことを維持できたかを確かめます。実際のツール呼び出しや待機中の動作を評価するときは、それらを観測できる実行環境を使います。

### 自作スキルやMCPサーバーを配る

[agent-plugin-tools](plugins/agent-plugin-tools/README.md) は、自作のスキルやMCPサーバーを、他の人が導入できる形にまとめるためのプラグインです。パッケージの作成から検証、配布までに使うツールを同梱し、このリポジトリの `agent` CLIがなくても使えます。

- [plugin-creator-agent-plugins](plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/SKILL.md) は、スキルやMCPサーバーをAgent Plugins v1形式のパッケージにまとめます。既存パッケージの検証・移行、Codexへのローカル導入、配布用Marketplaceの作成も依頼できます。

### CLIの操作や会話の検索を頼む

[ai-dotfiles-cli](plugins/ai-dotfiles-cli/README.md) は、このリポジトリの `agent` CLIを使う作業をエージェントに頼むためのプラグインです。CLI本体を別途導入すると、開発中のプラグインの管理や、書き出したCodexの会話の検索を自然文で依頼できます。

- [ai-dotfiles-cli](plugins/ai-dotfiles-cli/skills/ai-dotfiles-cli/SKILL.md) は、開発中のスキルリンクやプラグインの状態確認、共有Marketplaceへの同期、Codexの保守を進めます。
- [codex-history](plugins/ai-dotfiles-cli/skills/codex-history/SKILL.md) は、すでに書き出したCodexの会話を検索します。「以前この方針を選んだ理由は？」といった問いに対して、該当する発言を探し、判断の根拠をたどれるようにします。

### 普段使うdotに個別の指示やスキルを用意する

[dot-toolkit](plugins/dot-toolkit/README.md) は、普段使うメインのdotが、会話をまたいで利用者の個別指示やスキルを参照できるようにする非公式・実験的なプラグインです。dotのクラウド環境を設定・保守する手順も含みます。

- [dot-guidelines](plugins/dot-toolkit/skills/dot-guidelines/SKILL.md) は、継続して使うメインのdotに、利用者の個別指示、登録したスキル、クラウド上の作業ファイルの保存先をどう扱うか伝えます。初期設定や更新が必要なときは、対応する手順を読み込みます。

ChatGPT Webで導入し、メインのdotからスキルを読めることを確認してください。[日本語ガイド](docs/dot-toolkit/README.md) · [定期保守のタスク例](docs/dot-cloud-maintenance.md)

### Codexで使うには

目的のプラグインを配布しているMarketplace（プラグインのカタログ）をCodexに登録し、そこから導入します。このリポジトリのソースを直接試す場合は、ローカルのカタログに開発元を登録します。[Marketplaceからの導入](docs/marketplace/agent-marketplace-distribution.md#利用者がmarketplaceを登録する) · [ローカル開発版の導入](plugins/agent-plugin-tools/README.md#local-development)

スキルを個別に使う場合は、`SKILL.md` と参照資料・スクリプトを含むディレクトリ全体を導入します。開発中なら、ソースを `~/.agents/skills/` から直接参照するスキルリンクも使えます。同名スキルは個別版かプラグイン版のどちらか一方から読み込みます。たとえばGemini向け設計を個別に導入する場合は、共通の `prompt-design`、作業の分担や再開も設計するなら `agent-workflow-design` を併せて用意します。[スキルリンクの手順](docs/skill-links.md) · [設計スキルの導入](plugins/agent-design-tools/README.md#installation-and-updates)

## Codexの設定例

[`home/`](home/) にはホームディレクトリから書き出した公開用のコピーがあります。自分の環境に取り入れるときは、ファイルアクセス、ネットワーク、環境変数などに関する設定を確認し、使いたい項目を選んでください。

- **Codexの設定** — [config.tomlの例](home/.codex/config.toml)と[ユーザー設定・プロジェクト設定の使い分け](docs/codex/settings/codex-config-toml.md)。チャットで想定外のモデルが選ばれる場合は、[新規チャットのモデル選択](docs/codex/troubleshooting/codex-new-chat-model-selection.md)を参照してください。
- **Codexへの共通指示** — [ホーム用のAGENTS.md](home/.codex/AGENTS.md)と[日本語訳・設計理由](docs/codex/settings/codex-agents-md-instruction-rationale.md)。回答の詳しさ、作業中の待機、指示ファイルの読み方などを定めています。このリポジトリで開発するエージェントには、別途[ルートのAGENTS.md](AGENTS.md)が適用されます。
- **ブラウザーとGitの権限** — [ブラウザー設定例](home/.codex/browser/config.toml)、[ブラウザーの権限](docs/codex/settings/codex-browser-config-and-security.md)、[Git操作を任せるときの設定](docs/codex/settings/git-operations.md)。WindowsでGitへの書き込みが拒否される場合は、[アクセス権の確認と復旧](docs/codex/troubleshooting/codex-windows-git-write-acl-recovery.md)を参照してください。

## agentコマンド

`agent` は、このリポジトリが提供する管理用CLIです。ターミナルから単独で使えます。AIに操作を頼むための `ai-dotfiles-cli` プラグインは別途導入します。

**導入にはNode.js 24以降が必要です。** このリポジトリを取得し、ルートから自分のOSに合うコマンドを実行します。更新時も同じコマンドを使います。

- WindowsのPowerShellでは `.\scripts\install-agent.ps1` を実行します。ユーザーのPATHに追加した場合は新しい端末を開きます。
- macOS／Linuxでは `node scripts/install-agent.mjs` を実行し、`~/.local/bin` がPATHに含まれていることを確認します。これらのOSでの導入は実験的です。[OS別の導入手順と検証範囲](docs/agent-development.md#配置とインストール)

`agent --help` でコマンドの一覧が表示されれば起動できています。`agent info` では実行中のCLIの配置先とNode.jsの版を確認できます。続きは目的に応じて選んでください。

- **開発元と配布先を管理する** — `agent dev status` で登録した開発対象を確認します。`agent dev` にはスキルリンクの管理、共有Marketplaceへの同期、GitHub上のプラグインを参照するカタログの編集もあります。[開発環境の設定と使い方](docs/agent-development.md)
- **配布された単体スキルを導入する** — Marketplaceの接続設定を済ませると、`agent marketplace skill list` で一覧を確認し、必要なスキルを選んで導入・更新できます。[単体スキルの利用手順](docs/agent-development.md#別マシンで単体skillを利用する)
- **Codexの状態や会話を確認する** — `agent codex --help` で保守機能の一覧を表示します。実験的な `session` は履歴の整理と書き出し、`history` は書き出した会話の検索・参照に使います。セッションの書き出しは閲覧用で、そこから元のセッションを復元する機能はありません。アーカイブ・削除の前に対象と保護条件を確認してください。[Codex保守ガイド](docs/agent-codex.md) · [履歴の保護条件](docs/codex/codex-session-management.md)

## 設定の公開用エクスポート

自分のdotfilesを公開するときのコピー方向は **利用中のホーム → リポジトリの `home/`** です。設定を継続して変更する場合はホーム側の元ファイルを編集します。`home/` だけを編集すると、次の書き出しで上書きされることがあります。

1. [export.yaml](export.yaml)で公開対象を選びます。開発対象を記録する `development.json` は非公開です。`skill-links.json` は、このリポジトリ内を参照する宣言だけを書き出します。
2. リポジトリのルートで `npm run check:export` を実行し、実際のコピー元・コピー先と機密情報の候補を確認します。この段階ではファイルを書き出しません。
3. 検出事項を解消してから `npm run build` で書き出し、公開前に差分を目視で確認します。[エクスポートの対象・検査・手順](docs/export.md)

## リポジトリの開発・検証

プラグインの編集元は [plugins/](plugins/)、CLIの編集元は [tools/agent/](tools/agent/) です。配布用のコピーや導入済みキャッシュへの変更は、次回の更新で失われます。配置・公開範囲・変更時の検証条件は[開発用のAGENTS.md](AGENTS.md)にまとめています。

検証はNode.js 24以降を使い、リポジトリのルートで実行します。WindowsでインストーラーをテストするにはPowerShell 7（`pwsh`）も必要です。

- `npm run check` は通常の一括チェックです。合成データを使った設定エクスポート、CLI、スキルリンク、プラグイン用ツールと配布パッケージを検証します。
- プラグインの構造・同梱ファイルだけを重点的に調べるときは `npm run check:plugins` を使えます。評価ランナーや改善課題を変えた場合は `npm run check:eval-tools`、dotの指示・構築手順・評価セットを変えた場合は `npm run check:dot-toolkit` で各専用テストを実行します。

セッションのエクスポート試験には、その場所にも親を順にたどった先にも `.git` がない、書き込み可能な一時ディレクトリが必要です。標準の一時領域がこの条件を満たさない場合は、Windowsでは `TEMP` と `TMP`、macOS／Linuxでは `TMPDIR` で別の一時領域を指定します。OS・Node.jsの版・オプションによってスキップされる試験は未検証として扱います。[圧縮履歴・公式CLI互換・Windowsのアクセス権などの検証条件](docs/agent-development.md#検証範囲と実環境での確認)

スキルの設計変更とモデルを使った評価は、[プロンプト設計の記録](docs/prompt-design/README.md)、[ワークフロー設計の記録](docs/agent-workflow-design/README.md)、[評価ケースと証拠](evals/README.md)からたどれます。
