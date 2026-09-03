# CodexのプラグインMarketplaceを作成し、NASやGitで共有する

> **確認時点：** 2026年8月28日。Windows版Codex CLI 0.150.1、[OpenAIのプラグインドキュメント](https://developers.openai.com/plugins/build/plugins)、手元の実行結果で確認した内容です。CLIのオプションやローカルMarketplaceの扱いは、Codexの更新で変わる可能性があります。

Codexでは、複数のプラグインを一つのMarketplaceへまとめ、ローカルディレクトリ、NAS、Gitリポジトリから導入できます。プラグインごとにMarketplaceを用意する必要はありません。開発者は各プラグインのソースをそれぞれのリポジトリで管理し、共有してよい版だけを一つのMarketplaceへ集約できます。

このノートでは、Agent Plugins v1形式のプラグインを対象に、`plugin-creator-agent-plugins`付属の`assemble-plugin-marketplace.mjs`でファイルシステム上のMarketplaceを作成・更新する方法と、利用者がCodexへ登録・インストールする方法を説明します。OpenAIへ提出して共通のPlugins Directoryへ掲載する公開工程は対象外です。

## 開発元、Marketplace、インストール先を分ける

Marketplaceを共有するときは、次の三つを別のものとして扱います。

| 層 | 役割 | 手で編集するか |
| --- | --- | --- |
| プラグインのソースリポジトリ | `plugin.json`、`skills/`、`mcp.json`などを開発する正本 | 編集する |
| 共有Marketplace | 確認済みのプラグインを集めた配布用コピーとカタログ | 組み立て設定だけを編集する |
| Codexのインストール先 | CodexがMarketplaceから取得してキャッシュした利用中のコピー | 編集しない |

更新は次の方向に流します。

```text
各プラグインのソースリポジトリ
        ↓ init / add / sync
共有Marketplace
        ↓ codex plugin add
利用者のCodex管理領域
        ↓
新しいタスクで確認
```

Marketplaceの配布用コピーやCodexのキャッシュを直接編集し、その内容をソースリポジトリへ戻してはいけません。開発中の変更はソースリポジトリへ行い、配布可能な区切りでMarketplaceを同期します。

## Marketplaceの構成

組み立てスクリプトは、次の構成を作ります。

```text
<marketplace-root>/
├── .agents/
│   ├── plugin-marketplace-development/
│   │   ├── config.json
│   │   ├── schema.json
│   │   └── state.json
│   └── plugins/
│       └── marketplace.json
└── plugins/
    ├── <first-plugin>/
    └── <second-plugin>/
```

`config.json`だけが人間の管理する組み立て設定です。`schema.json`、`state.json`、`.agents/plugins/marketplace.json`、`plugins/<plugin-name>/`は生成物なので、直接編集しません。

`config.json`はMarketplaceのルートに置かれるため、そのディレクトリやリポジトリへアクセスできる利用者からも読めます。絶対ソースパスにはユーザー名やローカルのディレクトリ構成が含まれる場合があるので、公開するGitリポジトリでは、Marketplaceとソースリポジトリの配置をそろえて相対パスを使い、commit前に設定内容を確認してください。`config.json`に認証情報や秘密情報を記録してはいけません。

Marketplaceのルートには、ローカルディレクトリ、チェックアウト済みのGitリポジトリ、書き込み可能なNASのUNCパスを指定できます。ルートとなるフォルダが存在しなくても、親フォルダへ書き込めれば`init`が作成します。NASを使う場合、共有への認証、ドライブの割り当て、共有権限の設定はスクリプトの対象外です。

## 前提を確認する

この手順にはNode.jsと、次のスクリプトを含む`plugin-creator-agent-plugins`が必要です。

```text
~/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs
```

追加するプラグインは、ルートにAgent Plugins v1の`plugin.json`を持つ検証可能なパッケージである必要があります。確認時点のOpenAI公式ドキュメントは`.codex-plugin/plugin.json`を使うCodex固有形式も説明しているため、形式の違いは[CodexのAgent SkillsとAgent Pluginsの構成と使い分け](codex-skills-and-plugins.md)を参照してください。このスクリプトはCodex固有形式をAgent Plugins v1へ自動変換しません。

スクリプトを引数なしで実行すると、ファイルを変更せずヘルプを表示します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs"
```

## 最初のMarketplaceを作成する

ここでは、二つのプラグインを`team-plugins`というMarketplaceへまとめます。`<marketplace-root>`、`<first-plugin-root>`、`<second-plugin-root>`は、実際の絶対パスへ置き換えてください。同じ`--category`が、`init`で指定したすべてのプラグインへ適用されます。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" init `
  '<marketplace-root>' `
  --name 'team-plugins' `
  --display-name 'Team Plugins' `
  --plugin '<first-plugin-root>' `
  --plugin '<second-plugin-root>' `
  --category 'Productivity'
```

`--name`は、インストール時の`my-plugin@team-plugins`にも使うMarketplaceの識別名です。`--display-name`には、Codex上で利用者に見せる表示名を指定します。

NASへ直接作る場合、`<marketplace-root>`には次のようなUNCパスを指定できます。

```text
\\server\share\agents\marketplace
```

`init`は各プラグインを検証し、Marketplaceの設定とschemaを作ります。この時点では配布用のコピーとカタログを生成しません。続けて`sync`を実行します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" sync `
  '<marketplace-root>'
```

`sync`は、設定されたすべてのソースを検証し、変更されたプラグインだけをコピーして、最後にMarketplaceカタログを更新します。同期後は、ファイルを変更しない`check`で、ソース、配布用コピー、カタログ、schema、stateにずれがないことを確認します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" check `
  '<marketplace-root>'
```

成功すると、次のメッセージが表示されます。

```text
Marketplace distribution is current.
```

`init`は最初の一度だけ実行します。すでに設定があるMarketplaceで再実行すると、既存設定を上書きせず終了します。

## 新しいプラグインを追加する

Marketplaceの作成後にプラグインが増えた場合は、`add`でソースとカテゴリーを設定へ追加します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" add `
  '<marketplace-root>' `
  '<new-plugin-root>' `
  --category 'Developer tools'
```

`add`は新しいプラグインを検証して`config.json`へ登録しますが、配布用ファイルはコピーしません。追加後に`sync`と`check`を実行します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" sync `
  '<marketplace-root>'

node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-plugin-marketplace.mjs" check `
  '<marketplace-root>'
```

スクリプトは`plugin.json`からプラグイン名を取得し、同じ名前のプラグインがすでに登録されていれば追加を拒否します。既存プラグインはソースと内容が同じならコピーを省略するため、NASへの不要な書き込みも抑えられます。

## 開発と共有を分ける

開発者は、普段どおり各ソースリポジトリのローカルMarketplaceからプラグインをインストールして構いません。ローカルでインストールするたびに共有Marketplaceを同期する必要はありません。ソースリポジトリに固有のテストや`local-plugin.mjs validate`がある場合は先に実行し、共有してよい状態になった時点で`sync`と`check`を実行します。Marketplaceの組み立て時に行う検証はポータブルなパッケージが対象であり、リポジトリ固有のテストやバージョン更新は含みません。

NAS上の`config.json`に`C:\...`のような絶対ソースパスを記録した場合、そのパスへアクセスできる開発者のPCから同期します。共有者はソースリポジトリへアクセスする必要がなく、NASに生成されたMarketplaceを利用するだけです。

`sync`は、Gitのcommitやpush、NASへのログイン、CodexへのMarketplace登録、利用者環境へのインストールを行いません。Gitリポジトリを配布先にする場合は、同期後の差分を確認し、通常のリリース手順でcommitとpushを行います。

## 利用者がMarketplaceを登録する

利用者は、初回だけMarketplaceのルートをCodexへ登録します。NASの場合はUNCパスをそのまま指定できます。

```powershell
codex plugin marketplace add '\\server\share\agents\marketplace'
```

GitHub上のMarketplaceを使う場合は、`owner/repository`またはGit URLを指定できます。特定のrefを固定するときは`--ref`を使います。

```powershell
codex plugin marketplace add 'owner/repository' --ref main
```

登録後、Marketplace名と解決されたルートを確認します。

```powershell
codex plugin marketplace list
```

インストールしていないプラグインも含めて確認する場合、Codex CLI 0.150.1では`--available`と`--json`を一緒に指定します。

```powershell
codex plugin list --available --json
```

目的のプラグインが表示されたら、`<plugin-name>@<marketplace-name>`の形式でインストールします。

```powershell
codex plugin add 'my-plugin@team-plugins'
```

インストール後はChatGPTデスクトップを再起動し、新しいCodexタスクでスキルやMCPサーバーが読み込まれることを確認します。実行中のタスクには、開始時に読み込んだプラグインの指示やツール定義が残る場合があります。

## 利用者が更新版を取り込む

インストール済みのプラグインは、利用のたびにMarketplace上のファイルを直接読みません。インストール時にCodexの管理領域へコピーするため、共有Marketplaceが更新された後は同じプラグインを再インストールします。通常の更新では、先にアンインストールする必要はありません。

NASやローカルディレクトリを登録したMarketplaceでは、次のコマンドを再実行します。

```powershell
codex plugin add 'my-plugin@team-plugins'
```

`codex plugin marketplace upgrade`は、確認時点のCLIではGit Marketplaceのsnapshotを更新するコマンドです。NASやローカルディレクトリの更新には使いません。

Git Marketplaceでは、先にsnapshotを更新してからプラグインを再インストールします。

```powershell
codex plugin marketplace upgrade 'team-plugins'
codex plugin add 'my-plugin@team-plugins'
```

どちらの場合も、再インストール後はChatGPTデスクトップを再起動し、新しいタスクで確認します。

## 別のMarketplaceへ切り替える

同名プラグインのローカル開発版から共有版へ切り替えるなど、供給元を変更する場合は、二つを有効なまま混在させず、現在のプラグインIDを指定して削除してから新しい供給元をインストールします。

```powershell
codex plugin remove 'my-plugin@old-marketplace'
codex plugin add 'my-plugin@team-plugins'
```

Marketplace自体が不要になった場合は、そのMarketplaceからインストールしたプラグインを確認したうえで登録を削除します。

```powershell
codex plugin marketplace remove 'team-plugins'
```

## NAS、Git、ローカルディレクトリを使い分ける

| 配布先 | 向いている用途 | 更新時の要点 |
| --- | --- | --- |
| NAS | 同じネットワーク内で、Gitの資格情報を配らず共有する | 開発者がNASへ`sync`し、利用者はプラグインを再インストールする |
| Gitリポジトリ | 履歴、レビュー、複数拠点からの取得を重視する | 開発者が`sync`後にcommit・pushし、利用者はMarketplaceを`upgrade`して再インストールする |
| ローカルディレクトリ | 個人開発、検証、同じPC上での利用 | ソースまたは配布用ディレクトリを登録し、更新後に再インストールする |

Marketplaceの構成はどの配布先でも同じです。一つのMarketplaceへ複数のプラグインを登録できるため、チームや用途ごとに必要なまとまりを作り、プラグインごとのMarketplaceを増やさないようにします。

## 手編集と削除に注意する

`sync`は、前回生成した内容と異なる手編集を検出すると、既存のプラグインコピーやカタログを上書きせず停止します。手作業をソースリポジトリへ移すか、生成物を前回の状態へ戻してから再実行してください。`state.json`を書き換えて検出を回避してはいけません。

プラグインをMarketplaceから外す場合は、`config.json`から対象エントリーを削除して`sync`します。カタログからは外れますが、古い`plugins/<plugin-name>/`ディレクトリは自動削除されません。削除対象が正しいことを確認してから、別の操作として削除またはアーカイブします。

NASへの同期で、アクセス拒否、接続断、容量・クォータ不足、ファイルの使用中など、判別できるファイルシステムエラーが発生した場合、スクリプトはOSのエラーと対象パスを残し、確認事項を表示して停止します。元のエラーに加えて後始末やロールバックにも失敗した場合は、元の原因を隠さず、追加の失敗として対象パスを表示します。

スクリプトが共有への認証、ドライブの割り当て、権限変更、NASの容量確保を行うことはありません。Windowsから共有へ接続できること、共有とファイルシステムの権限、実行ユーザーの資格情報、空き容量をスクリプトの外で確認し、復旧後に同じコマンドを再実行します。インターネット接続の許可と、UNCパスへのファイル書き込み許可は別の制御です。

同じMarketplaceに対する`init`、`add`、`sync`は同時に実行しないでください。再実行後に独立した確認が必要なら`check`を使います。一時ファイルやバックアップの後始末に失敗したと表示された場合は、示されたパスとMarketplaceの状態を確認してから手動で処理します。

## 参考資料

- [OpenAI「Package your plugin」](https://developers.openai.com/plugins/build/plugins)
- [Agent Plugins v1仕様](https://agent-plugins.org/specification)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](codex-skills-and-plugins.md)
- [`plugin-creator-agent-plugins`](../../plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/SKILL.md)
- [Marketplace組み立て手順](../../plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/references/marketplace-distribution.md)
