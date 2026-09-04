# ai-dotfiles

CodexやAIエージェント向けの設定、`AGENTS.md`、Agent Plugins、補助スクリプトを公開用に管理する個人用dotfilesリポジトリです。

A personal dotfiles repository for managing shareable Codex and AI agent configurations, `AGENTS.md` files, Agent Plugins, and helper scripts.

> [!IMPORTANT]
> このリポジトリの設定は個人用です。再利用する場合は、ファイルアクセス、ネットワーク、環境変数の各権限を自分の環境に合わせて確認してください。
>
> Codexでこのリポジトリを信頼済みプロジェクトとして開くと、`.codex/config.toml`がプロジェクト設定としても読み込まれます。このため、プロジェクトを信頼する前に設定内容を確認してください。
>
> These settings are personal. Before reusing them, review file access, network, and environment variable permissions for your environment.
>
> When this repository is opened as a trusted project in Codex, `.codex/config.toml` is also loaded as project configuration. Therefore, review it before trusting the project.

エクスポートの仕組みと使い方は、[Export guide](docs/export.md)を参照してください。

## Agent Plugins

再利用するスキルは、Agent Plugins v1形式の二つのプラグインを正本として管理します。

- `plugins/agent-design-tools/`：`prompt-design`と`agent-workflow-design`
- `plugins/agent-plugin-tools/`：`plugin-creator-agent-plugins`

開発中の正本を`~/.agents/skills/`から直接参照するローカルリンクは、`~/.agents/skill-links.json`で一括管理します。公開用コピーには、このリポジトリ内を参照する宣言だけを書き出します。コマンド、状態表示、安全境界は[開発中のスキルをユーザースコープへリンクする](docs/skill-links.md)を参照してください。

複数リポジトリにまたがるスキルリンク、ローカルのプラグイン統合、共有Marketplaceの検査と同期には、短い共通入口として`agent dev`を使えます。CLIの正本は`tools/agent/`に置き、`scripts/install-agent.ps1`でホームディレクトリへ導入します。マシン固有の対象は公開しない`~/.agents/development.json`へ登録します。構成と使い方は[`agent dev`でローカル開発を管理する](docs/agent-development.md)を参照してください。

ポータブルなプラグイン構造は、次のコマンドで検証できます。

```powershell
npm run check:plugins
```

`npm run check`は、ホームディレクトリから公開設定を取り込むエクスポート計画、スキルリンクのマニフェスト、二つのプラグインを続けて検証します。Marketplaceへ登録するのは、検証済みのプラグインディレクトリです。インストール済みコピーやCodexのキャッシュは正本として編集しません。
