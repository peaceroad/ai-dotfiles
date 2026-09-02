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

ポータブルなプラグイン構造は、次のコマンドで検証できます。

```powershell
npm run check:plugins
```

`npm run check`は、ホームディレクトリから公開設定を取り込むエクスポート計画と、二つのプラグインを続けて検証します。Marketplaceへ登録するのは、検証済みのプラグインディレクトリです。インストール済みコピーやCodexのキャッシュは正本として編集しません。
