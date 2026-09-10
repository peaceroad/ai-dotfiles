# `agent dev`でローカル開発を管理する

`agent dev`は、複数のリポジトリで開発するAgent Skill、Agent Plugin、共有Marketplaceについて、既存の管理処理を短い共通コマンドから呼び分けるローカルCLIです。モデルが判断するAgent Skillではなく、明示したJSONを決定的に処理する開発用の入口です。

Codexの状態確認と既知問題の回避は、同じインストーラーに含まれる[`agent codex`](./agent-codex.md)から実行できます。スキル／プラグイン開発用の設定とは独立した機能です。

## 管理境界

三つの同期先を分けます。

| コマンド | 正本 | 同期または検査する対象 |
| --- | --- | --- |
| `agent dev skill ...` | 各開発リポジトリのスキル | `~/.agents/skills/`のリンク |
| `agent dev plugin ...` | プラグインの開発リポジトリ | リポジトリ内Marketplaceを経由したCodexのインストール状態 |
| `agent dev marketplace ...` | プラグイン／Skillの開発リポジトリ、または明示した導入済みSkill | NASやGit checkoutなどの共有Marketplace |

プラグイン本体を`~/.agents/`へ複製しません。`~/.agents/ai-dotfiles/development.json`は、`agent dev`が扱う開発対象と共有Marketplaceの望ましい構成について、人が管理するローカルな正本です。ただし、プラグイン本体、Skill本体、配布用コピー、Codexのインストール済みコピーの正本ではありません。共有Marketplaceへの同期も、ローカルのプラグイン統合確認とは別の明示的な操作です。

## 配置とインストール

Windows／Linux／macOSともNode.js 24以降が必要です。インストーラーは要件未満のNode.jsでは書き込み前に停止します。起動用スクリプトとランタイムの改行は、リポジトリの`.gitattributes`でLFに固定しています。

公開する正本は、このリポジトリの`tools/agent/`と、各管理処理を所有するディレクトリに置きます。利用時はインストーラーが、CLIとその実行に必要なmanager、validator、schemaを同じ版のランタイムとして`~/.agents/`へコピーします。

```text
ai-dotfiles/
├── tools/agent/
│   ├── agent.cmd
│   ├── agent.mjs
│   ├── agent.test.mjs
│   ├── codex/                  ← Codex診断の入口と単体スクリプト
│   └── development.schema.json
└── scripts/
    ├── install-agent.mjs
    ├── install-agent.test.mjs
    └── install-agent.ps1

~/.agents/
├── ai-dotfiles/
│   ├── development.json
│   ├── development.schema.json
│   ├── skill-links.json
│   ├── state/
│   │   ├── marketplaces/
│   │   │   └── <marketplace-name>--<root-id>.json
│   │   └── skill-installations.json
│   └── runtime/
│       ├── agent.mjs
│       ├── manage-skill-links.mjs
│       ├── codex/
│       └── plugin-tools/
└── scripts/
    └── agent.cmd  ← Windowsの起動入口
```

PowerShellから次を実行すると、`agent.cmd`、`agent.mjs`、schemaと固定されたランタイム一式を`~/.agents/`へ導入します。`~/.agents/scripts`がユーザーまたはマシンの永続的な`Path`にない場合だけ、インストール後にユーザー`Path`へ追加するかを`[y/N]`で確認します。PowerShellプロファイルは変更しません。

```powershell
.\scripts\install-agent.ps1
```

PowerShellプロファイルの影響を除外したい場合や、PowerShell以外のホスト、CIから呼び出す場合は、`pwsh -NoProfile -File .\scripts\install-agent.ps1`という完全な形も使えます。インストーラー自身は実行ポリシーを変更または迂回しません。

ユーザー`Path`へ追加した場合は、新しいターミナルを開いて`agent --help`で確認します。更新時も同じコマンドを再実行します。内容が同じなら`Current`と表示して置換せず、管理済みの旧版なら`Updated`として更新します。管理外の同名ファイルや別の`agent`コマンドがある場合は停止します。管理外ファイルを確認済みで置き換える場合に限り`-Force`を使えますが、別コマンドとの名前衝突は先に解消する必要があります。無人実行でユーザー`Path`へ追加する場合は`-AddToPath`、変更しない場合は`-SkipPathRegistration`を指定します。変更予定だけを見る場合は、Path登録も含めるなら`-AddToPath -WhatIf`を使います。

### Linux／macOSへの導入

ファイルの配置・更新・保護はNode.js製の`install-agent.mjs`が共通で担当します。Windowsの`install-agent.ps1`は共通処理を呼び出し、ユーザーPATH登録と`-WhatIf`／確認を扱います。`-Confirm`はランタイム一式に対して確認します。

Linux／macOSではNode.jsを用意し、リポジトリのルートから実行します。テストと同梱ツールも動かす環境にはNode.js 24以降を使ってください。導入と`agent dev`にはPowerShellやPythonは不要です。`agent codex`の各診断ツールには、別途OSや実行環境の要件があります。

```sh
node scripts/install-agent.mjs --dry-run
node scripts/install-agent.mjs
agent --help
```

共通ランタイムを`~/.agents/ai-dotfiles/runtime/`へコピーし、実行権限を付けた`agent.mjs`への相対シンボリックリンクを`~/.local/bin/agent`に作ります。リンク先はインストール済みコピーなので、実行に元のcheckoutは不要です。Linux／macOSには`agent.cmd`をコピーしません。`--agents-root PATH`と`--bin-dir PATH`で配置先を変更できます。

`~/.local/bin`がPATHにない場合は、使用するシェルの設定へ追加します。bash／zshでは次を現在の端末で実行できます。永続化する場合は自身のシェルの起動設定へ記載してください。インストーラーは起動設定を編集しません。

```sh
export PATH="$HOME/.local/bin:$PATH"
```

更新も同じ導入コマンドを再実行します。`--force`は確認済みの管理外の通常ファイルを置き換える指定です。別の`agent`ファイル・リンク、PATH上の別コマンド、配置ルート自体やその内部を転送するリンクは強制指定でも拒否します。上位ディレクトリのリンク（macOSの`/tmp`など）は実体へ解決します。aliasやfunctionとの衝突は検出できないため、起動先が違う場合は`type agent`で確認してください。個々のファイルは一時ファイル経由で置き換えますが、一式全体の更新はトランザクションではありません。途中で失敗した場合は原因を解消して再実行します。

`development.json`は各環境で管理します。Windowsのドライブ文字やUNCパスをLinuxへそのまま引き継がず、Linux側で参照できるcheckoutやマウント先を指定してください。外部CLIを呼ぶ機能には、その環境内のCLIも必要です。

### macOSのターミナルから使う

macOSも共通のNode.jsインストーラーで導入します。`sh install-agent.mjs`ではなく、上記の`node scripts/install-agent.mjs`を実行してください。インストール後の`agent`は、先頭の`#!/usr/bin/env node`によってNode.jsで起動します。zsh／bash用の別実装はありません。

zshでPATHを永続化する場合は、`~/.zshrc`（`ZDOTDIR`を設定している場合はそのディレクトリの`.zshrc`）に、未設定の場合だけ次の行を追加します。

```sh
export PATH="$HOME/.local/bin:$PATH"
```

新しいターミナルを開き、起動先とヘルプを確認します。

```sh
command -v node
command -v agent
agent --help
```

Node.jsの配置先は固定していません。Apple Silicon／Intelとも、そのMacで動くNode.js 24以降をPATHから使用します。ただし、両アーキテクチャでの実測は未実施です。更新時も同じインストーラーを再実行します。

### OSをまたぐMarketplaceの利用

新しい配布物は`sha256-tree-v2:`形式で、相対パス・ファイル種別・内容・相対リンク先を検証します。名前の順序はUTF-8バイト順に固定し、OSやマウント方法で変わる権限値・所有者・時刻は含めません。内容の一致は実行権限の保証ではありません。必要な権限は利用環境で管理し、スクリプトは必要に応じて`node script.mjs`など指定されたインタープリターから起動します。権限だけの変更は同期の対象になりません。

旧`sha256:`形式も従来の権限込みの計算で検証します。既存Marketplaceは元の環境で全体`sync`を実行してからOS間で移動してください。手編集された配布物は移行時も上書きしません。利用側の`agent`も新形式を読める版へ更新します。導入済みSkillの旧管理状態は、`update`時に既存内容の一致を確認して新形式へ移行します。Gitの改行変換などで内容自体が変わった場合は、引き続き不一致になります。

### 検証範囲と実環境での確認

```sh
npm run check:agent-dev
```

Windowsでは共通テストとPowerShellインストーラーテストを実行します。Linux／macOSでは実行権限、リンク経由の起動、リンク先の保護、上位ディレクトリの別名を経由した再インストールも確認します。macOSではさらに`/bin/zsh`からPATH経由の起動を検証します。対象外のOSでは各テストをスキップします。共通テストだけの入口は`npm run check:agent-dev:common`です。

この対応はWindows環境で実装しました。Ubuntu（WSL2）およびmacOSでの実測は未実施です。実環境では、まず上記テストを実行し、導入、`agent --help`、再インストールを確認してください。Skillのcheck/syncやMarketplace操作は試験用のソースと配布先で確認し、Codexへのplugin syncは実際のインストール操作として別途確認します。特定ディストリビューションのパッケージ管理には依存しませんが、他のLinuxで実測済みとは扱いません。

CLIが実行する共通managerは、`~/.agents/skills/`の発見リンクから読み込みません。直接リンクを一時的に外してプラグイン統合を確認する場合もCLI自身の依存が失われず、インストール済みCLIとmanagerの版もそろいます。スキルに同梱したスクリプトは、単独利用とプラグイン側の正本として引き続き保持します。

インストーラーはファイルごとの所有マーカーを検査します。`@ai-dotfiles`マーカーはCLIとスキルリンク管理など、このリポジトリ固有のファイルだけに使います。汎用plugin manager、validator、Marketplace assembler、schemaは`@plugin-creator-agent-plugins`のマーカーを保持し、他のプラグインリポジトリへ生成したrunnerへ`ai-dotfiles`固有の所有情報を持ち込みません。以前インストールしたランタイムに限り、更新時の移行判定で旧`@ai-dotfiles`マーカーも受け付けます。

マシン固有のリポジトリやUNCパスを含む設定は、`~/.agents/ai-dotfiles/development.json`に置きます。開発設定と`state/`はGitと公開用エクスポートから除外します。`skill-links.json`はこのリポジトリ内を参照する宣言だけを書き出し、公開するschemaの正本は`tools/agent/development.schema.json`に置きます。

### ローカル設定と状態

`ai-dotfiles/`直下に人が管理する設定とschema、`state/`にCLIが更新する状態、`runtime/`に実装と内部ツールを置きます。`skill-links.json`もこのリポジトリが所有する設定として同じ場所にまとめます。スキル本体の配置先`~/.agents/skills/`は変更しません。Windowsの起動入口は`~/.agents/scripts/agent.cmd`、Linux／macOSは`~/.local/bin/agent`に残し、どちらも`runtime/agent.mjs`を実行します。

インストーラーはランタイムとschemaだけを更新し、設定や状態の作成・移動は行いません。旧配置を使っている環境のデータ移動は、ほかの`agent`操作を止めて個別に行います。受け入れ済みリビジョンを捨てて初回扱いにすると共有側の変更を見逃す可能性があるため、設定だけでなく記録も保持してください。

`AGENT_DEV_CONFIG`で設定先を指定する場合、受け入れ記録はその設定に隣接する`state/marketplaces/`を使います。Skillの導入状態は設定ファイル別ではなく、ユーザーの`~/.agents/ai-dotfiles/state/`で共有します。

### 初回設定と更新

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

`configure`で`authoritative`から`contributor`または`consumer`へ切り替える前には、全体`check`と同じ検査を実行します。他の担当者の更新で差分が生じている場合は、`agent dev marketplace check --interactive`から共有側の内容を確認して切り替えます。この経路では、差分を消すための全体同期を要求しません。`contributor`では対象指定なしの`check/sync`がローカルに割り当てた項目を順に部分処理し、割り当てていない共有項目を保持します。`consumer`では開発用の`check/sync`自体が無効です。

`contributor`または`consumer`から`authoritative`へ切り替える場合、CLIは共有Marketplaceに存在するすべてのプラグイン名とSkill名が、ローカルの割り当てから解決できるか検査します。一つでもソースが手元になければ切り替えを拒否します。全件がそろった場合だけ、ローカルの割り当てを完全な正本にすることを確認して切り替えます。`consumer`から`contributor`への変更も、共有先へ部分更新できる権限拡大として明示的に確認します。

`plugins[].target`と`skills[].target`は、上位に登録したローカル対象を参照します。同じソースパスをMarketplaceごとに重複させず、一つの対象を複数Marketplaceへ割り当てられます。

`development.json`はschema v2だけを受け付けます。試行段階のschema v1を自動変換する互換コードは持ちません。旧ファイルが残っている場合は別名で退避し、`configure`でv2を作り直してください。既存Marketplaceの構成を引き継ぐ場合は、退避したローカル設定を参照しながら「Connect existing Marketplace」を使います。

`agent.cmd`は、自身の配置先を基準に`../ai-dotfiles/runtime/agent.mjs`をNode.jsで実行するだけで、開発処理を重複実装しません。端末固有の設定とインストール済みコピーをリポジトリの正本に戻さないことで、公開可能なコードとローカル環境の境界を保ちます。

## 使い方

ローカル開発元へのスキルリンクは、`agent dev skill link`の専用メニューで登録・変更・解除できます。初回登録で`skill-links.json`を作成し、リンク作成は`sync`で行います。これはMarketplaceからのSkill導入や、Marketplaceへ配布するSkill対象の登録とは別の操作です。手順と安全条件は[スキルリンクのガイド](./skill-links.md#コマンドから登録変更解除する)を参照してください。

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

Marketplaceが一つだけなら名前を省略できます。複数ある場合はMarketplace名を指定します。`authoritative`の対象指定なしの`check/sync`はMarketplace全体を処理します。`contributor`ではローカルに割り当てたプラグインとSkillを順に部分処理するため、毎回`--plugin`や`--skill`を指定する必要はありません。割り当てていない項目は保持されます。途中で失敗すると残りを停止し、完了済みの処理は巻き戻しません。

状態表示は次の読み取り専用コマンドで行います。

```powershell
agent dev skill status
agent dev plugin status my-plugin
agent dev marketplace status team
```

全体同期では、共有設定、配布state、カタログの内容を前回受け入れた版と比較し、変更があれば停止します。初回だけは、共有側とローカルの登録内容が一致すれば別途承認せずに同期し、成功後にリビジョンを記録します。登録内容が異なる場合は、次の対話操作で確認します。ソース本文やGitの版が最新であることを保証する判定ではありません。

受け入れ記録は、`development.json`に隣接する`state/marketplaces/`へ保存します。ファイル名はMarketplace名とルートパスのSHA-256識別子を組み合わせ、中に`marketplace`、`rootId`、`revision`、`acceptedAt`を保持します。日付別の履歴ではなく最新の基準を1件保持し、Marketplace名を変更しても接続先の識別子で照合します。`acceptedAt`はこのPCが受け入れた日時であり、共有側の更新日時や更新者ではありません。`status`と通常の`check`は記録を更新しません。

```powershell
agent dev marketplace check team --interactive
```

共有項目を表示した後、共有の割り当てをローカル設定へ取り込むか、担当するローカル項目を選んで`contributor`へ切り替えるかを選びます。取り込みには全項目のソースをローカル対象として登録しておく必要があります。ソース本文やGit checkoutは更新されないため、取り込み後の全体同期前にはソースの更新状況を確認してください。確認中に共有側またはローカル設定が変わった場合は保存せず停止します。

通常の`check`は入力待ちや設定変更を行わず、対象・確認範囲・共有リビジョン・内部ツールの診断・結果・次の操作を標準出力の一つのレポートにまとめます。レポート全体を貼り付けて相談できます。個人のホームディレクトリと共有ルートは表示用の記号へ置き換え、対象名・相対パス・エラーコードを残します。

結果は`IN SYNC`（表示された範囲が一致）、`NOT VERIFIED`（差分または検証エラーあり）、`UNABLE TO CHECK`（読み取りや検査を実行できない）、`NOTHING TO CHECK`（担当項目なし）です。差分や確認不能では非ゼロで終了します。アクセス拒否を「ファイルがない」「一致している」と扱いません。`contributor`または項目指定時は未確認の共有項目があることを明示します。

`--interactive`を付けると、診断レポートの後に設定調整へ進みます。共有設定を読めない場合は対話へ進みません。設定調整はMarketplace単位なので、`--plugin`や`--skill`との併用はできません。旧`reconcile`は`check --interactive`の互換用別名として利用できます。

モードはPCごとのローカル設定で、自動的には切り替わりません。担当者を共有する仕組みもないため、複数人が同じ項目をローカルに割り当てた場合は双方が更新できます。`contributor`への切替では、自分が担当する項目だけを選びます。CLIが所有する対話・エラー文は英語です。外部コマンドやOSの診断は原文のまま表示します。

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

`agent marketplace list`は`agent marketplace skill list`の短縮形です。一覧表示はカタログだけを読み、配布用コピーの内容検証は行いません。`install`と`update`は選択したSkillについてカタログのdigestと共有先のコピーを照合してから導入し、管理外の同名Skillや導入後にローカル変更されたSkillを上書きしません。Skill内のシンボリックリンクは相対リンクに限り、Skillルート内へ解決できないリンク、壊れたリンク、絶対リンクを拒否します。`remove`も、このCLIが導入し、内容が導入時のdigestと一致するSkillだけを削除します。管理状態は`~/.agents/ai-dotfiles/state/skill-installations.json`へ置き、導入済みSkillディレクトリには書き込みません。状態を変更する操作は`~/.agents/ai-dotfiles/state/skill-installations.lock`で直列化し、一覧表示はロックせず読み取りだけを行います。異常終了後にロックが残った場合は、ほかの導入・更新・削除が動いていないことを確認してから、そのディレクトリだけを削除します。

プラグインについて同じキャッシュ機能は重複実装しません。Codexへ登録したMarketplace、利用可能なプラグイン、インストール済みコピーはCodexアプリとCLIが管理するためです。`agent`は共有用プラグインを組み立てますが、利用者側のプラグイン導入にはCodexのMarketplace機能を使います。

## 下位コマンドとの対応

`agent dev`は、次の既存入口を呼び分けます。

| 短いコマンド | 呼び出す入口 |
| --- | --- |
| `skill check` / `skill sync` | `manage-skill-links.mjs check` / `sync` |
| `plugin check` | `repository-managed`ではリポジトリの`local-plugin.mjs validate --config ...`、`direct`では共通managerの`validate <plugin-root>` |
| `plugin sync` | `repository-managed`ではリポジトリの`local-plugin.mjs install --config ...`、`direct`では明示されたversion方針を付けた共通managerの`install <plugin-root>` |
| `marketplace configure` / `marketplace setup` | `~/.agents/ai-dotfiles/development.json`の対話的な作成・更新 |
| `marketplace check` / `marketplace sync` | `development.json`から一時的な組み立て定義を作り、`assemble-agent-marketplace.mjs check` / `sync --config ...`を実行 |
| `agent marketplace skill ...` | 共有先の`.agents/skills/catalog.json`を検証し、`~/.agents/skills`の管理済みコピーを導入・更新・削除 |

各管理スクリプトが持つ検証、安全な更新、version方針、ドリフト検出はそのまま利用します。CLIがそれらの処理を再実装することはありません。

## 関連資料

- [開発中のスキルをユーザースコープへリンクする](skill-links.md)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](notes/codex-skills-and-plugins.md)
- [Agent MarketplaceでプラグインとSkillをNASやGitへ配布する](notes/agent-marketplace-distribution.md)
