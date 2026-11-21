# ai-dotfiles

Codexの設定例と、AIエージェントに仕事を頼むためのスキルを公開している個人用dotfilesリポジトリです。スキルやプラグインの開発・配布、Codexの保守に使う `agent` コマンドも提供しています。それぞれ必要なものだけ利用できます。

- [用途からプラグインを選ぶ](#用途からプラグインを選ぶ) — AIにプロンプトを書いてもらう、繰り返し作業を設計する、スキルを評価する。
- [Codexの設定例を読む](#codexの設定例) — 設定ファイルや共通指示を開き、その項目を採用した理由を調べる。
- [agentコマンドを導入する](#agentコマンド) — ターミナルからスキルを管理・配布する、Codexの履歴を整理する。

## 用途からプラグインを選ぶ

スキルは、特定の仕事を依頼したときにエージェントが読む指示です。このリポジトリでは、関連するスキルやツールをAgent Plugins v1形式のプラグインにまとめています。

- **プロンプトや作業手順を設計する** — [agent-design-tools](plugins/agent-design-tools/README.md)。依頼文や `AGENTS.md` の曖昧さを直すなら `prompt-design`、定期作業の分担・待機・中断後の再開を設計するなら `agent-workflow-design` を使います。Gemini用の指示や画像・動画用のプロンプトには `gemini-instruction-design` があります。
- **スキルの変更に効果があったか確かめる** — [agent-eval-tools](plugins/agent-eval-tools/README.md)。実験用の `agent-improve` で変更前後に同じ課題を試し、改善した点と維持できた動作を比較できます。付属ランナーはテキストを扱います。実際のツール呼び出しや待機中の動作を測るには、それらを観測できる実行環境を使います。
- **自作スキルやMCPサーバーをプラグインとして配る** — [agent-plugin-tools](plugins/agent-plugin-tools/README.md)。`plugin-creator-agent-plugins` と同梱ツールでパッケージの作成・検証・移行や、配布用カタログの管理ができます。このプラグインは単独で使えます。
- **このリポジトリのCLI操作をAIに頼む** — [ai-dotfiles-cli](plugins/ai-dotfiles-cli/README.md)。同名のスキルが、導入済みの `agent` を使って開発対象の状態確認やCodexの保守を進めます。保存済みの会話から過去の判断を探すときは、同梱の `codex-history` を使います。
- **普段使うdotに個別の指示やスキルを用意する** — [dot-toolkit](plugins/dot-toolkit/README.md)。メインのdot向けの非公式・実験的なプラグインです。ChatGPT Webで導入し、メインのdotが `dot-guidelines` を読めることを確認します。初期設定・更新は[日本語ガイド](docs/dot-toolkit/README.md)、定期保守を組む場合は[タスクの設定例](docs/dot-cloud-maintenance.md)を参照してください。

たとえばCodexで「この依頼を繰り返し使えるプロンプトにして」と頼むと、対象モデルが未指定なら `prompt-design` は **GPT-6.2 Astra** 向けに設計します。利用先が決まっていれば、そのモデルに合わせます。GPT-6.2 Solと従来のGPT-6 Astraも指定できます。これは作成するプロンプトの設計基準で、実行中のモデルの設定は変わりません。`agent-workflow-design` は待機や復旧をモデル未指定のまま設計でき、委任先のモデルを選べる場合は仕事の難しさや必要な能力を考慮します。[対象モデルの選び方](plugins/agent-design-tools/README.md#model-targeting) · [依頼例で見るスキルの使い分け](docs/notes/skill-creator-prompt-design-agent-workflow-design.md#具体的な依頼での選び方)

### Codexで使うには

目的のプラグインを配布しているMarketplace（プラグインのカタログ）をCodexに登録し、そこから導入します。このリポジトリのソースを直接試す場合は、ローカルのカタログに開発元を登録します。[Marketplaceからの導入](docs/notes/agent-marketplace-distribution.md#利用者がmarketplaceを登録する) · [ローカル開発版の導入](plugins/agent-plugin-tools/README.md#local-development)

スキルを個別に使う場合は、`SKILL.md` と参照資料・スクリプトを含むディレクトリ全体を導入します。開発中なら、ソースを `~/.agents/skills/` から直接参照するスキルリンクも使えます。同名スキルは個別版かプラグイン版のどちらか一方から読み込みます。たとえばGemini向け設計を個別に導入する場合は、共通の `prompt-design`、作業の分担や再開も設計するなら `agent-workflow-design` を併せて用意します。[スキルリンクの手順](docs/skill-links.md) · [設計スキルの導入](plugins/agent-design-tools/README.md#installation-and-updates)

## Codexの設定例

[`home/`](home/) にはホームディレクトリから書き出した公開用のコピーがあります。自分の環境に取り入れるときは、ファイルアクセス、ネットワーク、環境変数などに関する設定を確認し、使いたい項目を選んでください。

- **Codexの設定** — [config.tomlの例](home/.codex/config.toml)と[ユーザー設定・プロジェクト設定の使い分け](docs/notes/codex-config-toml.md)。チャットで想定外のモデルが選ばれる場合は、[新規チャットのモデル選択](docs/notes/codex-new-chat-model-selection.md)を参照してください。
- **Codexへの共通指示** — [ホーム用のAGENTS.md](home/.codex/AGENTS.md)と[日本語訳・設計理由](docs/notes/codex-agents-md-instruction-rationale.md)。回答の詳しさ、作業中の待機、指示ファイルの読み方などを定めています。このリポジトリで開発するエージェントには、別途[ルートのAGENTS.md](AGENTS.md)が適用されます。
- **ブラウザーとGitの権限** — [ブラウザー設定例](home/.codex/browser/config.toml)、[ブラウザーの権限](docs/notes/codex-browser-config-and-security.md)、[Git操作を任せるときの設定](docs/notes/git-operations.md)。WindowsでGitへの書き込みが拒否される場合は、[アクセス権の確認と復旧](docs/notes/codex-windows-git-write-acl-recovery.md)を参照してください。

## agentコマンド

`agent` は、このリポジトリが提供する管理用CLIです。ターミナルから単独で使えます。AIに操作を頼むための `ai-dotfiles-cli` プラグインは別途導入します。

**導入にはNode.js 24以降が必要です。** このリポジトリを取得し、ルートから自分のOSに合うコマンドを実行します。更新時も同じコマンドを使います。

- WindowsのPowerShellでは `.\scripts\install-agent.ps1` を実行します。ユーザーのPATHに追加した場合は新しい端末を開きます。
- macOS／Linuxでは `node scripts/install-agent.mjs` を実行し、`~/.local/bin` がPATHに含まれていることを確認します。これらのOSでの導入は実験的です。[OS別の導入手順と検証範囲](docs/agent-development.md#配置とインストール)

`agent --help` でコマンドの一覧が表示されれば起動できています。`agent info` では実行中のCLIの配置先とNode.jsの版を確認できます。続きは目的に応じて選んでください。

- **開発元と配布先を管理する** — `agent dev status` で登録した開発対象を確認します。`agent dev` にはスキルリンクの管理、共有Marketplaceへの同期、GitHub上のプラグインを参照するカタログの編集もあります。[開発環境の設定と使い方](docs/agent-development.md)
- **配布された単体スキルを導入する** — Marketplaceの接続設定を済ませると、`agent marketplace skill list` で一覧を確認し、必要なスキルを選んで導入・更新できます。[単体スキルの利用手順](docs/agent-development.md#別マシンで単体skillを利用する)
- **Codexの状態や会話を確認する** — `agent codex --help` で保守機能の一覧を表示します。実験的な `session` は履歴の整理と書き出し、`history` は書き出した会話の検索・参照に使います。セッションの書き出しは閲覧用で、そこから元のセッションを復元する機能はありません。アーカイブ・削除の前に対象と保護条件を確認してください。[Codex保守ガイド](docs/agent-codex.md) · [履歴の保護条件](docs/notes/codex-session-management.md)

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
