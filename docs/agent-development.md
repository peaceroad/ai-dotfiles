# `agent dev`でローカル開発を管理する

`agent dev`は、複数のリポジトリで開発するAgent Skill、Agent Plugin、共有Marketplaceについて、既存の管理処理を短い共通コマンドから呼び分けるローカルCLIです。モデルが判断するAgent Skillではなく、明示したJSONを決定的に処理する開発用の入口です。

## 管理境界

三つの同期先を分けます。

| コマンド | 正本 | 同期または検査する対象 |
| --- | --- | --- |
| `agent dev skill ...` | 各開発リポジトリのスキル | `~/.agents/skills/`のリンク |
| `agent dev plugin ...` | プラグインの開発リポジトリ | リポジトリ内Marketplaceを経由したCodexのインストール状態 |
| `agent dev marketplace ...` | 各プラグインの開発リポジトリ | NASやGit checkoutなどの共有Marketplace |

プラグイン本体を`~/.agents/`へ複製しません。`~/.agents/development.json`は、`agent dev`が扱う開発対象と共有Marketplaceの望ましい構成について、人が管理するローカルな正本です。ただし、プラグイン本体、配布用コピー、Codexのインストール済みコピーの正本ではありません。共有Marketplaceへの同期も、ローカルのプラグイン統合確認とは別の明示的な操作です。

## 配置とインストール

公開する正本は、このリポジトリの`tools/agent/`と、各管理処理を所有するディレクトリに置きます。利用時はインストーラーが、CLIとその実行に必要なmanager、validator、schemaを同じ版のランタイムとして`~/.agents/`へコピーします。

```text
ai-dotfiles/
├── tools/agent/
│   ├── agent.cmd
│   ├── agent.mjs
│   ├── agent.test.mjs
│   └── development.schema.json
└── scripts/
    └── install-agent.ps1

~/.agents/
├── development.schema.json
└── scripts/
    ├── agent.cmd
    ├── agent.mjs
    ├── manage-skill-links.mjs
    └── agent-runtime/
        └── plugin-tools/
```

PowerShellから次を実行すると、`agent.cmd`、`agent.mjs`、schemaと固定されたランタイム一式を`~/.agents/`へ導入し、`~/.agents/scripts`をユーザーの`Path`へ追加します。PowerShellプロファイルは変更しません。

```powershell
.\scripts\install-agent.ps1
```

PowerShellプロファイルの影響を除外したい場合や、PowerShell以外のホスト、CIから呼び出す場合は、`pwsh -NoProfile -File .\scripts\install-agent.ps1`という完全な形も使えます。インストーラー自身は実行ポリシーを変更または迂回しません。

新しいターミナルを開き、`agent --help`で確認します。更新時も同じコマンドを再実行します。内容が同じなら`Current`と表示して置換せず、管理済みの旧版なら`Updated`として更新します。marker導入前にこのリポジトリが出力した3ファイル一式は自動的に移行し、当時インストール先へ置かれていたテストファイルも既知の内容と完全一致する場合だけ削除します。それ以外の管理外の同名ファイルや別の`agent`コマンドがある場合は停止します。管理外ファイルを確認済みで置き換える場合に限り`-Force`を使えますが、別コマンドとの名前衝突は先に解消する必要があります。変更予定だけを見る場合は`-WhatIf`、ユーザー`Path`を変更しない特殊な導入では`-SkipPathRegistration`を指定できます。

CLIが実行する共通managerは、`~/.agents/skills/`の発見リンクから読み込みません。直接リンクを一時的に外してプラグイン統合を確認する場合もCLI自身の依存が失われず、インストール済みCLIとmanagerの版もそろいます。スキルに同梱したスクリプトは、単独利用とプラグイン側の正本として引き続き保持します。

インストーラーはファイルごとの所有マーカーを検査します。`@ai-dotfiles`マーカーはCLIとスキルリンク管理など、このリポジトリ固有のファイルだけに使います。汎用plugin manager、validator、Marketplace assembler、schemaは`@plugin-creator-agent-plugins`のマーカーを保持し、他のプラグインリポジトリへ生成したrunnerへ`ai-dotfiles`固有の所有情報を持ち込みません。以前インストールしたランタイムに限り、更新時の移行判定で旧`@ai-dotfiles`マーカーも受け付けます。

マシン固有のリポジトリやUNCパスを含む設定は、インストーラーが作成も変更もしない`~/.agents/development.json`に置きます。このリポジトリでは対応する`.agents/development.json`を`.gitignore`の対象とし、`export.js`も`export.yaml`からの出力を拒否します。公開側には設定値を含まないschemaだけを保存します。

初回設定と更新には、対話式の`configure`を使えます。`setup`は同じ操作の別名です。どちらもローカル設定を保存するだけで、Marketplaceの同期やプラグインのインストールは始めません。

```powershell
agent dev marketplace configure
agent dev marketplace setup
```

Marketplaceが一つなら自動選択し、複数なら最初に今回の作業対象を選びます。選択は対話セッション内だけで保持し、メニューから切り替えられます。主メニューは9項目にまとめられ、数字に加えて`a`、`c`、`m`、`p`、`e`、`o`、`t`、`r`、`v`の文字でも選べます。日常的なプラグインの追加・更新は主メニューから行い、プラグイン開発対象の管理と削除操作だけをサブメニューにまとめています。プラグインの管理方式とversion方針は、内部値を直接入力させず、実際の効果を説明する番号付きの選択肢から選びます。

「Connect existing Marketplace」では、NASのUNCパスまたは手元に用意済みのMarketplace checkoutを指定します。`agent dev`で生成したMarketplaceなら、共有側の名前、表示名、プラグイン一覧を検証し、ローカルには接続情報だけを保存します。他の開発者が管理するプラグインをローカル開発対象として登録したり、配布用コピーをソースとして取り込んだりしません。従来の単体組み立て設定の場合は、記録されたソースを`direct`開発対象として取り込みますが、Codexへの誤インストールを避けるため`plugin sync`は明示的に有効化するまで停止します。

この接続はファイルの複製ではないため、`clone`とは呼びません。NASは共有パスを直接参照し、Git版は通常のGit手順でcloneした後、そのcheckoutパスへ接続します。プラグイン開発対象の追加時には、リポジトリ所有の開発設定を使う`repository-managed`か、ポータブルなプラグインルートを直接使う`direct`を選びます。削除前には確認し、Marketplaceへ割り当てられているプラグイン開発対象の削除は拒否します。

サブメニューでは`b`で主メニューへ戻れます。名前やパスなどの入力途中では`:back`を入力すると、その操作で入力済みの変更だけを破棄して直前のメニューへ戻ります。各操作は完了するまでセッション内設定へ反映されません。入力値や接続先の検証に失敗した場合も、その操作だけを破棄してメニューへ戻ります。最後に`s`を選ぶまでファイルは更新されず、`q`ならセッション全体の変更を破棄します。既存Marketplaceを直接扱う場合は、ローカル対象名も指定できます。

```powershell
agent dev marketplace configure team
```

```json
{
  "$schema": "./development.schema.json",
  "schemaVersion": 2,
  "plugins": {
    "my-plugin": {
      "repository": "~/git/example/my-plugin-project",
      "developmentConfig": ".agents/plugin-development/my-plugin.json"
    },
    "direct-plugin": {
      "repository": "~/git/example/portable-plugin-project",
      "pluginRoot": "plugins/direct-plugin",
      "versionPolicy": "keep"
    }
  },
  "marketplaces": {
    "team": {
      "root": "\\\\server\\share\\agents\\marketplace",
      "name": "team-plugins",
      "displayName": "Team Plugins",
      "mode": "authoritative",
      "plugins": [
        {
          "target": "my-plugin",
          "category": "Developer tools"
        },
        {
          "target": "direct-plugin",
          "category": "Productivity"
        }
      ]
    }
  }
}
```

`plugins.<name>.repository`はプラグインを所有するリポジトリです。各対象には、`developmentConfig`または`pluginRoot`のどちらか一方を指定します。対話上は前者を`repository-managed`、後者を`direct`と呼びます。

- `repository-managed`では、`developmentConfig`からプラグインルート、version方針、Node.js要件、リポジトリ固有チェック、必要ならローカルMarketplaceを解決します。既定では`<repository>/scripts/local-plugin.mjs`を呼び、別の配置を採用したリポジトリだけ相対パスの`runner`を指定します。自己完結したrunnerと設定を保持するため、CIや`agent`を導入していない環境でも同じ契約を実行できます。
- `direct`では、`pluginRoot`を共通の`manage-local-agent-plugin.mjs`へ渡します。`plugin check`はポータブルパッケージだけを読み取り専用で検証し、リポジトリ固有テストを推論しません。`plugin sync`を許可するには、このローカル設定へ`versionPolicy`の`bump`または`keep`を明示する必要があります。インストール時には、ソースのプラグインルートを指すローカルMarketplaceも共通managerから発見できなければなりません。共有Marketplaceの配布用コピーは開発ソースとして使いません。

`direct`の`versionPolicy`はversion挙動だけでなく、このPCからCodexへのインストールを許可したという明示にもなります。省略した対象でも、`plugin check`とMarketplaceの`check/sync`は使えますが、`plugin sync`は停止します。従来形式のMarketplaceから取り込んだ対象には自動設定されません。

`marketplaces.<name>.root`は共有Marketplaceのルートです。ローカルディレクトリ、Git checkout、アクセス可能なUNCパスを指定できます。`name`と`displayName`は生成するMarketplaceカタログの識別名と表示名です。`mode`が`authoritative`なら`plugins`はMarketplace全体の正本、`contributor`ならそのPCから更新するプラグインだけです。既存の管理済みMarketplaceへ接続すると`contributor`になり、`--plugin`なしの全体`check/sync`は拒否されます。

運用形態は、`configure`の「Change Marketplace management mode」から後で切り替えられます。対話では、1台のPCが全体を管理する`authoritative`と、複数の担当者が選択したプラグインだけを更新する`contributor`を選びます。

`authoritative`から`contributor`へ切り替える前には、`--plugin`を付けない全体`check`と同じ検査を実行します。登録された全ソース、配布用コピー、カタログ、schema、state、管理情報のいずれかにずれがあれば切り替えを拒否するため、全体`sync`を済ませてから再実行します。切り替えると全体`check/sync`が無効になり、既存の割り当てはこのPCから更新できる候補として残ります。不要な割り当ては続けて削除します。

`contributor`から`authoritative`へ切り替える場合、CLIは共有Marketplaceに存在するすべてのプラグイン名が、ローカルのプラグイン割り当てから解決できるか検査します。一つでもソースが手元になければ切り替えを拒否します。全件がそろった場合だけ、ローカルの割り当てを完全な正本にすることを確認して切り替えます。

`plugins[].target`は、上の`plugins`に登録したローカル開発対象を参照します。同じリポジトリパスをMarketplaceごとに重複させず、一つの開発対象を複数Marketplaceへ異なるカテゴリーで割り当てられます。

`development.json`はschema v2だけを受け付けます。試行段階のschema v1を自動変換する互換コードは持ちません。旧ファイルが残っている場合は別名で退避し、`configure`でv2を作り直してください。既存Marketplaceの構成を引き継ぐ場合は、退避したローカル設定を参照しながら「Connect existing Marketplace」を使います。

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

プラグインの正本を検証します。`repository-managed`ではリポジトリ固有の契約も実行し、`direct`ではポータブルパッケージだけを検証します。`check`はインストールやversionを変更しません。対象が複数ある場合は名前を指定します。

```powershell
agent dev plugin check my-plugin
```

ローカルMarketplaceからCodexへプラグインをインストールまたは更新します。

```powershell
agent dev plugin sync my-plugin
```

`plugin sync`は、`repository-managed`と`direct`のどちらでも、同じプラグインに含まれるスキル名が`~/.agents/skills/`に存在すると停止します。同名スキルの直接リンクとインストール済みプラグインを同時に有効化せず、日常のスキル開発とプラグイン統合確認を切り替えてください。CLIはリンクを自動削除しません。Marketplaceの`check/sync`はインストール操作ではないため、この競合検査の対象外です。

共有Marketplace全体について、ソース、配布用コピー、カタログ、stateのずれを検査または同期します。

```powershell
agent dev marketplace check team
agent dev marketplace sync team
```

Marketplaceが一つだけなら名前を省略できます。複数ある場合は、誤操作を防ぐためMarketplace名を指定します。通常の`check`と`sync`は、カタログとstateを含むMarketplace全体を処理します。

一つのプラグインだけを確認または同期するときは、`development.json`のローカルなプラグイン対象名を`--plugin`へ指定します。

```powershell
agent dev marketplace check team --plugin my-plugin
agent dev marketplace sync team --plugin my-plugin

# Marketplaceが一つなら名前を省略可能
agent dev marketplace sync --plugin my-plugin
```

`--plugin`を付けると、共有側の管理情報とカタログを読み、他のプラグインを保持したまま、指定したプラグインの追加または更新だけを反映します。各開発者の`development.json`には自分が更新する対象だけを登録できるため、一つのNAS MarketplaceやMarketplaceリポジトリを複数人で分担できます。部分操作では選択したソースと配布用コピーだけを検査し、ほかのプラグインが最新だとは判定しません。全体の配布状態を確認する区切りでは、Marketplace全体のソースを管理する担当者が`--plugin`を付けない`check`を使います。

同じMarketplaceに対する`agent dev marketplace sync`は、Marketplace内のロックディレクトリによって直列化されます。別の同期中は停止し、待機や自動再試行はしません。異常終了で`.agents/plugin-marketplace-development/agent-dev-sync.lock`が残った場合は、他の同期が実行中でないことを確認してから、そのディレクトリだけを削除します。組み立てスクリプトを直接使う経路にはこの外側のロックがないため、複数人で共有先を更新するときは`agent dev`を共通入口にします。

共有側のソースを含まない管理参照は、配布用コピーとカタログの同期に成功した後で更新します。組み立て処理が失敗した場合、管理参照を先行させず、失敗前の状態を維持します。

`marketplace sync`は、`development.json`の参照から実行時だけ組み立て定義を生成します。共有先の`.agents/plugin-marketplace-development/config.json`には、プラグイン名とカテゴリーを含む参照情報を生成しますが、開発マシンのリポジトリ絶対パスは書きません。このファイルには管理markerとdigestがあり、手編集を検出した場合は上書きせず停止します。構成変更は`configure`または`development.json`へ行います。

`check`は常に読み取り専用です。`sync`だけが、リンク作成、プラグインのインストールまたは更新、共有Marketplaceの生成物更新を行います。`agent`や`agent dev`、`marketplace configure`だけでは同期を開始しません。初回の`marketplace sync`は不足している管理ディレクトリや生成物を作成しますが、対象を自動探索せず、信頼するリポジトリと配布先は設定ファイルへ明示します。

既存の組み立てスクリプト用`config.json`が、`development.json`から解決したMarketplace名、表示名、プラグインソース、カテゴリーと完全に一致する場合、最初の`sync`でソースパスを含まない管理形式へ移行できます。一致しない管理外設定や、手編集された管理形式は自動的に引き継いだり置換したりしません。

## 下位コマンドとの対応

`agent dev`は、次の既存入口を呼び分けます。

| 短いコマンド | 呼び出す入口 |
| --- | --- |
| `skill check` / `skill sync` | `manage-skill-links.mjs check` / `sync` |
| `plugin check` | `repository-managed`ではリポジトリの`local-plugin.mjs validate --config ...`、`direct`では共通managerの`validate <plugin-root>` |
| `plugin sync` | `repository-managed`ではリポジトリの`local-plugin.mjs install --config ...`、`direct`では明示されたversion方針を付けた共通managerの`install <plugin-root>` |
| `marketplace configure` / `marketplace setup` | `~/.agents/development.json`の対話的な作成・更新 |
| `marketplace check` / `marketplace sync` | `development.json`から一時的な組み立て定義を作り、`assemble-plugin-marketplace.mjs check` / `sync --config ...`を実行 |

各管理スクリプトが持つ検証、安全な更新、version方針、ドリフト検出はそのまま利用します。CLIがそれらの処理を再実装することはありません。

## 関連資料

- [開発中のスキルをユーザースコープへリンクする](skill-links.md)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](notes/codex-skills-and-plugins.md)
- [CodexのプラグインMarketplaceを作成し、NASやGitで共有する](notes/codex-plugin-marketplace-distribution.md)
