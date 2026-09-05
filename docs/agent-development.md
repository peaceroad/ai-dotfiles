# `agent dev`でローカル開発を管理する

`agent dev`は、複数のリポジトリで開発するAgent Skill、Agent Plugin、共有Marketplaceについて、既存の管理処理を短い共通コマンドから呼び分けるローカルCLIです。モデルが判断するAgent Skillではなく、明示したJSONを決定的に処理する開発用の入口です。

## 管理境界

三つの同期先を分けます。

| コマンド | 正本 | 同期または検査する対象 |
| --- | --- | --- |
| `agent dev skill ...` | 各開発リポジトリのスキル | `~/.agents/skills/`のリンク |
| `agent dev plugin ...` | プラグインの開発リポジトリ | リポジトリ内Marketplaceを経由したCodexのインストール状態 |
| `agent dev marketplace ...` | プラグイン／Skillの開発リポジトリ、または明示した導入済みSkill | NASやGit checkoutなどの共有Marketplace |

プラグイン本体を`~/.agents/`へ複製しません。`~/.agents/development.json`は、`agent dev`が扱う開発対象と共有Marketplaceの望ましい構成について、人が管理するローカルな正本です。ただし、プラグイン本体、Skill本体、配布用コピー、Codexのインストール済みコピーの正本ではありません。共有Marketplaceへの同期も、ローカルのプラグイン統合確認とは別の明示的な操作です。

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

PowerShellから次を実行すると、`agent.cmd`、`agent.mjs`、schemaと固定されたランタイム一式を`~/.agents/`へ導入します。`~/.agents/scripts`がユーザーまたはマシンの永続的な`Path`にない場合だけ、インストール後にユーザー`Path`へ追加するかを`[y/N]`で確認します。PowerShellプロファイルは変更しません。

```powershell
.\scripts\install-agent.ps1
```

PowerShellプロファイルの影響を除外したい場合や、PowerShell以外のホスト、CIから呼び出す場合は、`pwsh -NoProfile -File .\scripts\install-agent.ps1`という完全な形も使えます。インストーラー自身は実行ポリシーを変更または迂回しません。

ユーザー`Path`へ追加した場合は、新しいターミナルを開いて`agent --help`で確認します。更新時も同じコマンドを再実行します。内容が同じなら`Current`と表示して置換せず、管理済みの旧版なら`Updated`として更新します。marker導入前にこのリポジトリが出力した3ファイル一式は自動的に移行し、当時インストール先へ置かれていたテストファイルも既知の内容と完全一致する場合だけ削除します。それ以外の管理外の同名ファイルや別の`agent`コマンドがある場合は停止します。管理外ファイルを確認済みで置き換える場合に限り`-Force`を使えますが、別コマンドとの名前衝突は先に解消する必要があります。無人実行でユーザー`Path`へ追加する場合は`-AddToPath`、変更しない場合は`-SkipPathRegistration`を指定します。変更予定だけを見る場合は、Path登録も含めるなら`-AddToPath -WhatIf`を使います。

CLIが実行する共通managerは、`~/.agents/skills/`の発見リンクから読み込みません。直接リンクを一時的に外してプラグイン統合を確認する場合もCLI自身の依存が失われず、インストール済みCLIとmanagerの版もそろいます。スキルに同梱したスクリプトは、単独利用とプラグイン側の正本として引き続き保持します。

インストーラーはファイルごとの所有マーカーを検査します。`@ai-dotfiles`マーカーはCLIとスキルリンク管理など、このリポジトリ固有のファイルだけに使います。汎用plugin manager、validator、Marketplace assembler、schemaは`@plugin-creator-agent-plugins`のマーカーを保持し、他のプラグインリポジトリへ生成したrunnerへ`ai-dotfiles`固有の所有情報を持ち込みません。以前インストールしたランタイムに限り、更新時の移行判定で旧`@ai-dotfiles`マーカーも受け付けます。

マシン固有のリポジトリやUNCパスを含む設定は、インストーラーが作成も変更もしない`~/.agents/development.json`に置きます。このリポジトリでは対応する`.agents/development.json`を`.gitignore`の対象とし、`export.js`も`export.yaml`からの出力を拒否します。公開側には設定値を含まないschemaだけを保存します。

初回設定と更新には、対話式の`configure`を使えます。`setup`は同じ操作の別名です。どちらもローカル設定を保存するだけで、Marketplaceの同期やプラグインのインストールは始めません。

```powershell
agent dev marketplace configure
agent dev marketplace setup
```

`marketplace`は長いため、すべての`agent marketplace ...`と`agent dev marketplace ...`で`mp`を短縮形として使えます。正式なコマンド名とドキュメント上の基本表記は`marketplace`のままです。例えば、`agent dev mp sync`と`agent mp skill list`は、それぞれ`agent dev marketplace sync`と`agent marketplace skill list`と同じです。

`dev`は省略しません。`dev`配下は開発ソースからローカル統合先や共有配布物を更新する操作、`agent marketplace ...`配下は配布済みSkillを利用する操作です。この境界をコマンド上に残すことで、将来のSkill・プラグイン利用コマンドとの衝突や、同期先の取り違えを避けます。

Marketplaceが一つなら自動選択し、複数なら最初に今回の作業対象を選びます。選択は対話セッション内だけで保持し、メニューから切り替えられます。主メニューは9項目にまとめられ、数字と表示された短縮文字を使えます。プラグインと単体Skillの割り当て、ローカルソース対象の管理、削除は種類を選ぶサブメニューへまとめています。プラグインの管理方式、version方針、Skillの取得元は、内部値を直接入力させず、実際の効果を説明する番号付きの選択肢から選びます。

「Connect existing Marketplace」では、NASのUNCパスまたは手元に用意済みのMarketplace checkoutを指定します。`agent dev`で生成したMarketplaceなら、共有側の名前、表示名、プラグインとSkillの一覧を検証し、ローカルには接続情報だけを保存します。他の開発者が管理するソースをローカル開発対象として登録したり、配布用コピーをソースとして取り込んだりしません。従来の単体組み立て設定の場合は、記録された外部ソースをローカル対象として取り込みます。ただし、プラグインのCodexへの誤インストールを避けるため、取り込んだ`direct`対象の`plugin sync`は明示的に有効化するまで停止します。

この接続はファイルの複製ではないため、`clone`とは呼びません。NASは共有パスを直接参照し、Git版は通常のGit手順でcloneした後、そのcheckoutパスへ接続します。プラグイン開発対象の追加時には、リポジトリ所有の開発設定を使う`repository-managed`か、ポータブルなプラグインルートを直接使う`direct`を選びます。削除前には確認し、Marketplaceへ割り当てられているプラグイン開発対象の削除は拒否します。

サブメニューでは`b`で主メニューへ戻れます。名前やパスなどの入力途中では`:back`を入力すると、その操作で入力済みの変更だけを破棄して直前のメニューへ戻ります。各操作は完了するまでセッション内設定へ反映されません。入力値や接続先の検証に失敗した場合も、その操作だけを破棄してメニューへ戻ります。最後に`s`を選ぶまでファイルは更新されず、`q`ならセッション全体の変更を破棄します。既存Marketplaceを直接扱う場合は、ローカル対象名も指定できます。

```powershell
agent dev marketplace configure team
```

```json
{
  "$schema": "./development.schema.json",
  "schemaVersion": 2,
  "skills": {
    "my-skill": {
      "repository": "~/git/example/my-skill-project",
      "skillRoot": "skills/my-skill",
      "sourceUrl": "https://github.com/example/my-skill-project"
    },
    "skill-cleaner-cache": {
      "installedSkill": "skill-cleaner",
      "sourceUrl": "https://github.com/steipete/agent-scripts"
    }
  },
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
      ],
      "skills": [
        { "target": "my-skill" },
        { "target": "skill-cleaner-cache" }
      ]
    }
  }
}
```

`skills.<name>`は、通常は`repository`とリポジトリ相対の`skillRoot`で開発元を指定します。この経路では`~/.agents/skills`を参照しません。他者から導入したSkillを自分の別マシンでも再利用するため保存する場合だけ、`installedSkill`で`~/.agents/skills/<name>`を明示的に選びます。これは編集用の正本ではなく、Marketplaceへ保存するスナップショットです。CLIは`~/.agents/skills`全体を走査・公開しません。

`sourceUrl`は任意の来歴情報です。公開リポジトリがある場合はHTTPまたはHTTPS URLを記録でき、URLのない社内Skillでは省略できます。`configure`から後で追加、変更、削除できます。導入済みSkillのfrontmatterに`metadata.github-repo`があれば、対話ではそのURLを初期候補として示します。URLは取得や更新を自動化する権限ではなく、配布物の由来を確認するためのメモです。共有カタログへ出るため、認証情報、クエリ文字列、フラグメントを含むURLは拒否します。

`plugins.<name>.repository`はプラグインを所有するリポジトリです。各対象には、`developmentConfig`または`pluginRoot`のどちらか一方を指定します。対話上は前者を`repository-managed`、後者を`direct`と呼びます。

- `repository-managed`では、`developmentConfig`からプラグインルート、version方針、Node.js要件、リポジトリ固有チェック、必要ならローカルMarketplaceを解決します。既定では`<repository>/scripts/local-plugin.mjs`を呼び、別の配置を採用したリポジトリだけ相対パスの`runner`を指定します。自己完結したrunnerと設定を保持するため、CIや`agent`を導入していない環境でも同じ契約を実行できます。
- `direct`では、`pluginRoot`を共通の`manage-local-agent-plugin.mjs`へ渡します。`plugin check`はポータブルパッケージだけを読み取り専用で検証し、リポジトリ固有テストを推論しません。`plugin sync`を許可するには、このローカル設定へ`versionPolicy`の`bump`または`keep`を明示する必要があります。インストール時には、ソースのプラグインルートを指すローカルMarketplaceも共通managerから発見できなければなりません。共有Marketplaceの配布用コピーは開発ソースとして使いません。

`direct`の`versionPolicy`はversion挙動だけでなく、このPCからCodexへのインストールを許可したという明示にもなります。省略した対象でも、`plugin check`とMarketplaceの`check/sync`は使えますが、`plugin sync`は停止します。従来形式のMarketplaceから取り込んだ対象には自動設定されません。

`marketplaces.<name>.root`は共有Marketplaceのルートです。ローカルディレクトリ、Git checkout、アクセス可能なUNCパスを指定できます。`name`と`displayName`は生成するMarketplaceカタログの識別名と表示名です。`mode`が`authoritative`なら`plugins`と`skills`はMarketplace全体の正本、`contributor`ならそのPCから更新する割り当てだけ、`consumer`なら閲覧とSkillの導入だけです。既存の管理済みMarketplaceへ接続すると、安全側の`consumer`になります。

試行版の共有先で`.agents/plugin-marketplace-development/`を使っている場合、新しいCLIは旧ディレクトリを黙って無視せず停止します。同期が実行中でないことを確認し、ディレクトリ全体を`.agents/marketplace-development/`へ一度だけ改名してください。新旧の両方を残してはいけません。

運用形態は、`configure`の「Change Marketplace management mode」から後で切り替えられます。対話では、1台のPCが全体を管理する`authoritative`、複数の担当者が選択したプラグインまたはSkillだけを更新する`contributor`、共有先を書き換えない`consumer`を選びます。

`authoritative`から`contributor`または`consumer`へ切り替える前には、部分指定のない全体`check`と同じ検査を実行します。登録された全ソース、配布用コピー、カタログ、schema、state、管理情報のいずれかにずれがあれば切り替えを拒否するため、全体`sync`を済ませてから再実行します。`contributor`では全体`check/sync`が無効になり、`consumer`では開発用の`check/sync`自体が無効になります。既存の割り当ては保持されるので、不要なら続けて削除します。

`contributor`または`consumer`から`authoritative`へ切り替える場合、CLIは共有Marketplaceに存在するすべてのプラグイン名とSkill名が、ローカルの割り当てから解決できるか検査します。一つでもソースが手元になければ切り替えを拒否します。全件がそろった場合だけ、ローカルの割り当てを完全な正本にすることを確認して切り替えます。`consumer`から`contributor`への変更も、共有先へ部分更新できる権限拡大として明示的に確認します。

`plugins[].target`と`skills[].target`は、上位に登録したローカル対象を参照します。同じソースパスをMarketplaceごとに重複させず、一つの対象を複数Marketplaceへ割り当てられます。

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

単体Skillも同様に、ローカル対象名を`--skill`へ指定して部分的に検査・同期できます。

```powershell
agent dev marketplace check team --skill my-skill
agent dev marketplace sync team --skill my-skill
```

共有先には`skills/<name>/`と`.agents/skills/catalog.json`が生成されます。Skillカタログには内容digestと、設定されている場合だけ`sourceUrl`が入ります。開発マシンのリポジトリパスや`~/.agents/skills`の実パスは保存しません。

同じMarketplaceに対する`agent dev marketplace sync`は、Marketplace内のロックディレクトリによって直列化されます。別の同期中は停止し、待機や自動再試行はしません。異常終了で`.agents/marketplace-development/agent-dev-sync.lock`が残った場合は、他の同期が実行中でないことを確認してから、そのディレクトリだけを削除します。組み立てスクリプトを直接使う経路にはこの外側のロックがないため、複数人で共有先を更新するときは`agent dev`を共通入口にします。

共有側のソースを含まない管理参照は、配布用コピーとカタログの同期に成功した後で更新します。組み立て処理が失敗した場合、管理参照を先行させず、失敗前の状態を維持します。

`marketplace sync`は、`development.json`の参照から実行時だけ組み立て定義を生成します。共有先の`.agents/marketplace-development/config.json`には、プラグイン名とカテゴリー、Skill名と任意の来歴URLを含む参照情報を生成しますが、開発マシンの絶対パスは書きません。このファイルには管理markerとdigestがあり、手編集を検出した場合は上書きせず停止します。構成変更は`configure`または`development.json`へ行います。

`check`は常に読み取り専用です。`sync`だけが、リンク作成、プラグインのインストールまたは更新、共有Marketplaceの生成物更新を行います。`agent`や`agent dev`、`marketplace configure`だけでは同期を開始しません。初回の`marketplace sync`は不足している管理ディレクトリや生成物を作成しますが、対象を自動探索せず、信頼するリポジトリと配布先は設定ファイルへ明示します。

既存の組み立てスクリプト用`config.json`が、`development.json`から解決したMarketplace名、表示名、プラグイン／Skillソース、カテゴリー、来歴URLと完全に一致する場合、最初の`sync`でソースパスを含まない管理形式へ移行できます。一致しない管理外設定や、手編集された管理形式は自動的に引き継いだり置換したりしません。

## 別マシンで単体Skillを利用する

Marketplaceの接続情報を`development.json`へ設定したマシンでは、配布されている単体Skillを一覧表示し、`~/.agents/skills`へ導入できます。Marketplaceが一つなら名前を省略でき、複数なら最後にローカルMarketplace対象名を指定します。

```powershell
agent marketplace skill list
agent marketplace skill install my-skill
agent marketplace skill update my-skill
agent marketplace skill remove my-skill

# Marketplaceが複数ある場合
agent marketplace skill install my-skill team
```

`agent marketplace list`は`agent marketplace skill list`の短縮形です。一覧表示はカタログだけを読み、配布用コピーの内容検証は行いません。`install`と`update`は選択したSkillについてカタログのdigestと共有先のコピーを照合してから導入し、管理外の同名Skillや導入後にローカル変更されたSkillを上書きしません。Skill内のシンボリックリンクは相対リンクに限り、Skillルート内へ解決できないリンク、壊れたリンク、絶対リンクを拒否します。`remove`も、このCLIが導入し、内容が導入時のdigestと一致するSkillだけを削除します。管理状態は`~/.agents/marketplace-skill-state.json`へ置き、導入済みSkillディレクトリには書き込みません。状態を変更する操作は`~/.agents/.marketplace-skill.lock`で直列化し、一覧表示はロックせず読み取りだけを行います。異常終了後にロックが残った場合は、ほかの導入・更新・削除が動いていないことを確認してから、そのディレクトリだけを削除します。

プラグインについて同じキャッシュ機能は重複実装しません。Codexへ登録したMarketplace、利用可能なプラグイン、インストール済みコピーはCodexアプリとCLIが管理するためです。`agent`は共有用プラグインを組み立てますが、利用者側のプラグイン導入にはCodexのMarketplace機能を使います。

## 下位コマンドとの対応

`agent dev`は、次の既存入口を呼び分けます。

| 短いコマンド | 呼び出す入口 |
| --- | --- |
| `skill check` / `skill sync` | `manage-skill-links.mjs check` / `sync` |
| `plugin check` | `repository-managed`ではリポジトリの`local-plugin.mjs validate --config ...`、`direct`では共通managerの`validate <plugin-root>` |
| `plugin sync` | `repository-managed`ではリポジトリの`local-plugin.mjs install --config ...`、`direct`では明示されたversion方針を付けた共通managerの`install <plugin-root>` |
| `marketplace configure` / `marketplace setup` | `~/.agents/development.json`の対話的な作成・更新 |
| `marketplace check` / `marketplace sync` | `development.json`から一時的な組み立て定義を作り、`assemble-agent-marketplace.mjs check` / `sync --config ...`を実行 |
| `agent marketplace skill ...` | 共有先の`.agents/skills/catalog.json`を検証し、`~/.agents/skills`の管理済みコピーを導入・更新・削除 |

各管理スクリプトが持つ検証、安全な更新、version方針、ドリフト検出はそのまま利用します。CLIがそれらの処理を再実装することはありません。

## 関連資料

- [開発中のスキルをユーザースコープへリンクする](skill-links.md)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](notes/codex-skills-and-plugins.md)
- [Agent MarketplaceでプラグインとSkillをNASやGitへ配布する](notes/agent-marketplace-distribution.md)
