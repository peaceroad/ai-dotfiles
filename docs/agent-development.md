# `agent dev`でローカル開発を管理する

`agent dev`は、複数のリポジトリで開発するAgent Skill、Agent Plugin、共有Marketplaceについて、既存の管理スクリプトを短い共通コマンドから呼び出すためのローカルCLIです。モデルが判断するAgent Skillではなく、明示したJSONを決定的に処理する薄いコマンドラッパーです。

## 管理境界

三つの同期先を分けます。

| コマンド | 正本 | 同期または検査する対象 |
| --- | --- | --- |
| `agent dev skill ...` | 各開発リポジトリのスキル | `~/.agents/skills/`のリンク |
| `agent dev plugin ...` | プラグインの開発リポジトリ | リポジトリ内Marketplaceを経由したCodexのインストール状態 |
| `agent dev marketplace ...` | 各プラグインの開発リポジトリ | NASやGit checkoutなどの共有Marketplace |

プラグイン本体を`~/.agents/`へ複製しません。`~/.agents/development.json`は開発対象を指すローカル索引であって、プラグイン、Marketplace、インストール済みコピーの正本ではありません。共有Marketplaceへの同期も、ローカルのプラグイン統合確認とは別の明示的な操作です。

## 配置とインストール

公開する正本は、このリポジトリの`tools/agent/`に置きます。利用時はインストーラーが必要な実行ファイルだけを`~/.agents/`へコピーします。

```text
ai-dotfiles/
├── tools/agent/
│   ├── agent.cmd
│   ├── agent.mjs
│   ├── agent.test.mjs
│   └── development.schema.json
└── scripts/
    └── install-agent.ps1
```

PowerShellから次を実行すると、`agent.cmd`、`agent.mjs`、schemaを`~/.agents/`へ導入し、`~/.agents/scripts`をユーザーの`Path`へ追加します。PowerShellプロファイルは変更しません。

```powershell
.\scripts\install-agent.ps1
```

PowerShellプロファイルの影響を除外したい場合や、PowerShell以外のホスト、CIから呼び出す場合は、`pwsh -NoProfile -File .\scripts\install-agent.ps1`という完全な形も使えます。インストーラー自身は実行ポリシーを変更または迂回しません。

新しいターミナルを開き、`agent --help`で確認します。更新時も同じコマンドを再実行します。内容が同じなら`Current`と表示して置換せず、既知の旧版なら`Updated`として更新します。marker導入前にこのリポジトリが出力した3ファイル一式は自動的に移行し、当時インストール先へ置かれていたテストファイルも既知の内容と完全一致する場合だけ削除します。それ以外の管理外の同名ファイルや別の`agent`コマンドがある場合は停止します。管理外ファイルを確認済みで置き換える場合に限り`-Force`を使えますが、別コマンドとの名前衝突は先に解消する必要があります。変更予定だけを見る場合は`-WhatIf`、ユーザー`Path`を変更しない特殊な導入では`-SkipPathRegistration`を指定できます。

マシン固有のリポジトリやUNCパスを含む設定は、インストーラーが作成も変更もしない`~/.agents/development.json`に置きます。このリポジトリでは対応する`.agents/development.json`を`.gitignore`の対象とし、`export.js`も`export.yaml`からの出力を拒否します。公開側には設定値を含まないschemaだけを保存します。

```json
{
  "$schema": "./development.schema.json",
  "schemaVersion": 1,
  "plugins": {
    "my-plugin": {
      "repository": "~/git/example/my-plugin-project",
      "config": ".agents/plugin-development/my-plugin.json"
    }
  },
  "marketplaces": {
    "team": {
      "root": "\\\\server\\share\\agents\\marketplace"
    }
  }
}
```

`plugins.<name>.repository`はプラグインを所有するリポジトリです。`config`は、そのリポジトリ内にある`.agents/plugin-development/<plugin-name>.json`を指定します。既定では`<repository>/scripts/local-plugin.mjs`を呼びます。別の配置を採用したリポジトリだけ、リポジトリ相対の`runner`を指定できます。

`marketplaces.<name>.root`は、`assemble-plugin-marketplace.mjs`で構成済みの共有Marketplaceルートです。ローカルディレクトリ、Git checkout、アクセス可能なUNCパスを指定できます。

`agent.cmd`は同じディレクトリの`agent.mjs`をNode.jsで実行するだけで、開発処理を重複実装しません。端末固有の設定とインストール済みコピーをリポジトリの正本に戻さないことで、公開可能なコードとローカル環境の境界を保ちます。

## 使い方

設定した対象名とヘルプを表示します。この操作は状態を変更しません。

```powershell
agent dev
```

スキルリンクを検査または同期します。

```powershell
agent dev skill check
agent dev skill sync
```

プラグインの正本とリポジトリ固有の契約を検証します。`check`はインストールやversionを変更しません。

```powershell
agent dev plugin check my-plugin
```

ローカルMarketplaceからCodexへプラグインをインストールまたは更新します。

```powershell
agent dev plugin sync my-plugin
```

`plugin sync`は、同じプラグインに含まれるスキル名が`~/.agents/skills/`に存在すると停止します。同名スキルの直接リンクとインストール済みプラグインを同時に有効化せず、日常のスキル開発とプラグイン統合確認を切り替えてください。CLIはリンクを自動削除しません。

共有Marketplace全体について、ソース、配布用コピー、カタログ、stateのずれを検査または同期します。

```powershell
agent dev marketplace check team
agent dev marketplace sync team
```

プラグインは個別に選びますが、Marketplaceはカタログとstateを含む整合性単位なので、選んだMarketplace全体を処理します。対象が一つだけ設定されている場合、プラグイン名またはMarketplace名を省略できます。複数ある場合は、誤操作を防ぐため名前の指定が必要です。

`check`は常に読み取り専用です。`sync`だけが、リンク作成、プラグインのインストールまたは更新、共有Marketplaceの生成物更新を行います。`agent`や`agent dev`だけでは同期を開始しません。初期化や対象の自動探索も行わず、信頼するリポジトリと配布先は設定ファイルへ明示します。

## 下位コマンドとの対応

`agent dev`は、次の既存入口を呼び分けます。

| 短いコマンド | 呼び出す入口 |
| --- | --- |
| `skill check` / `skill sync` | `manage-skill-links.mjs check` / `sync` |
| `plugin check` | リポジトリの`local-plugin.mjs validate --config ...` |
| `plugin sync` | リポジトリの`local-plugin.mjs install --config ...` |
| `marketplace check` / `marketplace sync` | `assemble-plugin-marketplace.mjs check` / `sync` |

各管理スクリプトが持つ検証、安全な更新、version方針、ドリフト検出はそのまま利用します。CLIがそれらの処理を再実装することはありません。

## 関連資料

- [開発中のスキルをユーザースコープへリンクする](skill-links.md)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](notes/codex-skills-and-plugins.md)
- [CodexのプラグインMarketplaceを作成し、NASやGitで共有する](notes/codex-plugin-marketplace-distribution.md)
