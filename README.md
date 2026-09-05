# ai-dotfiles

CodexやAIエージェント向けの設定、`AGENTS.md`、Agent Plugins、補助スクリプトを公開用に管理する個人用dotfilesリポジトリです。

A personal dotfiles repository for managing shareable Codex and AI agent configurations, `AGENTS.md` files, Agent Plugins, and helper scripts.

> [!IMPORTANT]
> このリポジトリの設定は個人用です。再利用する場合は、ファイルアクセス、ネットワーク、環境変数の各権限を自分の環境に合わせて確認してください。
>
> ホームディレクトリから取り込んだ設定は`home/`配下に保存します。`home/.codex/config.toml`はこのリポジトリのプロジェクト設定として読み込まれないため、ユーザー設定のサンプルを管理しながら、このプロジェクト固有のCodex設定と分離できます。背景は[Codexの新規チャットでモデル設定が反映されない問題](docs/notes/codex-new-chat-model-selection.md)を参照してください。
>
> These settings are personal. Before reusing them, review file access, network, and environment variable permissions for your environment.
>
> Settings exported from the home directory are stored below `home/`. Because `home/.codex/config.toml` is not loaded as this repository's project configuration, the user-setting sample remains separate from project-specific Codex settings.

エクスポートの仕組みと使い方は、[Export guide](docs/export.md)を参照してください。

## Agent Plugins

再利用するスキルは、Agent Plugins v1形式の二つのプラグインを正本として管理します。

- `plugins/agent-design-tools/`：`prompt-design`と`agent-workflow-design`
- `plugins/agent-plugin-tools/`：`plugin-creator-agent-plugins`

開発中の正本を`~/.agents/skills/`から直接参照するローカルリンクは、`~/.agents/skill-links.json`で一括管理します。公開用コピーには、このリポジトリ内を参照する宣言だけを書き出します。コマンド、状態表示、安全境界は[開発中のスキルをユーザースコープへリンクする](docs/skill-links.md)を参照してください。

複数リポジトリにまたがるスキルリンク、ローカルのプラグイン統合、プラグインと単体Skillを含む共有Marketplaceの検査と同期には、短い共通入口として`agent dev`を使えます。Marketplaceで配布された単体Skillは`agent marketplace skill`で一覧表示・導入・更新・削除でき、`marketplace`は`mp`へ短縮できます。CLIの正本は`tools/agent/`に置き、`scripts/install-agent.ps1`でホームディレクトリへ導入します。マシン固有の対象は公開しない`~/.agents/development.json`へ登録します。構成と使い方は[`agent dev`でローカル開発を管理する](docs/agent-development.md)を参照してください。

インストーラーは、コマンドのディレクトリが永続的な`Path`に未登録の場合だけ、ユーザー`Path`へ追加するか確認します。無人実行では`-AddToPath`または`-SkipPathRegistration`で選択を明示できます。

ポータブルなプラグイン構造は、次のコマンドで検証できます。

```powershell
npm run check:plugins
```

`npm run check`は、ホームディレクトリから公開設定を取り込むエクスポート計画、スキルリンクのマニフェスト、二つのプラグインを続けて検証します。Marketplaceへ登録するのは、検証済みのプラグインディレクトリです。インストール済みコピーやCodexのキャッシュは正本として編集しません。
