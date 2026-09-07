# ai-dotfiles

CodexやAIエージェント向けの設定、`AGENTS.md`、Agent Plugins、補助スクリプトを公開用に管理する個人用dotfilesリポジトリです。

A personal dotfiles repository for managing shareable Codex and AI agent configurations, `AGENTS.md` files, Agent Plugins, and helper scripts.

> [!IMPORTANT]
> このリポジトリの設定は個人用です。再利用する場合は、ファイルアクセス、ネットワーク、環境変数の各権限を自分の環境に合わせて確認してください。
>
> These settings are personal. Before reusing them, review file access, network, and environment variable permissions for your environment.

## 目的から探す

- **設定や`AGENTS.md`を参考にする**：[公開用の設定サンプル](home/)から必要なファイルを確認します。
- **自分の設定を公開用に書き出す**：[Export guide](docs/export.md)で、対象の指定、機密情報の検査、書き出し手順を確認します。
- **スキル・プラグインを開発する、NASへ同期する**：[`agent`コマンドのガイド](docs/agent-development.md)へ進みます。[インストール](docs/agent-development.md#配置とインストール)、[状態確認・検査・同期](docs/agent-development.md#使い方)をまとめています。
- **Marketplaceの単体Skillを利用する**：[別マシンで単体Skillを利用する](docs/agent-development.md#別マシンで単体skillを利用する)で、一覧表示・導入・更新・削除を確認します。
- **Windows版Codexの既知の問題を調べる**：[Codex関連スクリプト](home/.agents/scripts/codex/README.md)で、状態確認と修復の対象条件を確認します。汎用の修復ツールではないため、適用前に各スクリプトの安全条件を読んでください。

## このリポジトリのスキル・プラグイン

再利用するスキルは、Agent Plugins v1形式の二つのプラグインとして管理しています。用途と使い方は、各プラグインのREADMEを参照してください。

- [agent-design-tools](plugins/agent-design-tools/README.md)：プロンプトなどのモデル向け指示を設計する`prompt-design`と、反復・長時間の作業の進め方を設計する`agent-workflow-design`。
- [agent-plugin-tools](plugins/agent-plugin-tools/README.md)：ポータブルなプラグインの作成・検証・移行やMarketplaceの構築を支援する`plugin-creator-agent-plugins`。

組み込みの`skill-creator`も含めた選び方は、[3スキルの役割と使い分け](docs/notes/skill-creator-prompt-design-agent-workflow-design.md)にまとめています。

開発中のスキルをコピーせずに使いたい場合は、[スキルリンクのガイド](docs/skill-links.md)を参照してください。同名スキルの直接リンクとインストール済みプラグインは併用せず、日常のスキル開発とプラグイン全体の統合確認で切り替えます。

## 正本と公開用コピー

- [`plugins/`](plugins/)：このリポジトリで開発するプラグインの正本です。Marketplaceへ登録するのは検証済みのプラグインディレクトリで、インストール済みコピーやCodexのキャッシュは正本として編集しません。
- [`tools/agent/`](tools/agent/)：`agent` CLIの正本です。利用環境への導入・更新には、ガイドに記載したインストーラーを使います。
- [`home/`](home/)：ホームディレクトリから取り込んだ公開用コピーです。エクスポートは「ホーム → このリポジトリ」の一方向で、ここを編集してもホーム側へは反映されません。

`home/.codex/config.toml`は、このリポジトリ固有の`.codex/config.toml`と区別して配置しています。背景は[Codexの新規チャットでモデル設定が反映されない問題](docs/notes/codex-new-chat-model-selection.md)を参照してください。

マシン固有の開発対象は、公開しない`~/.agents/ai-dotfiles/development.json`で管理します。スキルリンクの宣言は`~/.agents/ai-dotfiles/skill-links.json`で管理し、公開用コピーにはこのリポジトリ内を参照する宣言だけを書き出します。

## 変更後の検証・評価記録

リポジトリの検証にはNode.js 24以降を使います。Windowsで`npm run check`を実行する場合は、インストーラーのテスト用にPowerShell 7（`pwsh`）も必要です。次のコマンドはリポジトリのルートで実行します。

- `npm run check`：エクスポート計画のドライラン、`agent` CLI・スキルリンク・プラグイン管理ツールのテスト、マニフェストと二つのプラグインの検証。
- `npm run check:plugins`：二つのプラグインのポータブルな構造だけを検証。

設定の書き出しは検証とは別の操作です。[Export guide](docs/export.md#使い方)の順序に従い、ホーム側の正本と書き出し予定を確認してから実行してください。

スキルや指示の評価入力・応答・manifestは[評価記録](evals/README.md)からたどれます。評価の説明、採用判断、限界は、そこからリンクした`docs/`内の文書にまとめています。
