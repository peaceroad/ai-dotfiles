# Agent MarketplaceでプラグインとSkillをNASやGitへ配布する

> **確認時点：** 2026年9月5日。Windows版Codex CLI 0.150.1、[OpenAIのプラグインドキュメント](https://developers.openai.com/plugins/build/plugins)、手元の実行結果で確認した内容です。CLIのオプションやローカルMarketplaceの扱いは、Codexの更新で変わる可能性があります。

Codexでは、複数のプラグインを一つのMarketplaceへまとめ、ローカルディレクトリ、NAS、Gitリポジトリから導入できます。このリポジトリの`agent`コマンドは、同じルートに単体Skillの配布用コピーと独自カタログも生成します。開発者は各ソースをそれぞれのリポジトリで管理し、共有してよい版だけを一つの場所へ集約できます。

このノートでは、Agent Plugins v1形式のプラグインと単体Agent Skillを対象に、`plugin-creator-agent-plugins`付属の`assemble-agent-marketplace.mjs`でファイルシステム上のMarketplaceを作成・更新する方法を説明します。プラグインはCodexのMarketplace機能で、単体Skillは`agent marketplace skill`で導入します。OpenAIへ提出して共通のPlugins Directoryへ掲載する公開工程は対象外です。

## 開発元、Marketplace、インストール先を分ける

Marketplaceを共有するときは、次の三つを別のものとして扱います。

| 層 | 役割 | 手で編集するか |
| --- | --- | --- |
| プラグイン／Skillのソースリポジトリ | パッケージを開発する通常の正本 | 編集する |
| 導入済みSkillのスナップショット元 | 明示的に選んだ`~/.agents/skills/<name>` | 配布用の入力として読むだけ |
| 共有Marketplace | 確認済みのプラグイン／Skillを集めた配布用コピーとカタログ | 組み立て設定だけを編集する |
| 利用者のインストール先 | Codexまたは`agent`が導入した利用中のコピー | 編集しない |

更新は次の方向に流します。

```text
各パッケージのソース、または明示したSkillスナップショット
        ↓ sync
共有Marketplace
        ├─ codex plugin add → Codexのプラグイン管理領域
        └─ agent marketplace skill install → ~/.agents/skills
        ↓
新しいタスクで確認
```

Marketplaceの配布用コピーやCodexのキャッシュを直接編集し、その内容をソースリポジトリへ戻してはいけません。開発中の変更はソースリポジトリへ行い、配布可能な区切りでMarketplaceを同期します。

## Marketplaceの構成

組み立てスクリプトは、次の構成を作ります。

```text
<marketplace-root>/
├── .agents/
│   ├── marketplace-development/
│   │   ├── config.json
│   │   ├── schema.json
│   │   └── state.json
│   ├── plugins/
│   │   └── marketplace.json
│   └── skills/
│       └── catalog.json
├── plugins/
│   ├── <first-plugin>/
│   └── <second-plugin>/
└── skills/
    └── <skill-name>/
```

`.agents/marketplace-development/`は、この組み立て処理が使うMarketplace単位の管理領域です。プラグインと単体Skillの両方を扱うため、管理領域を一方のコンポーネント名へ結び付けません。

試行版で使っていた`.agents/plugin-marketplace-development/`は廃止しました。新しいツールは旧ディレクトリを黙って無視せず停止します。同期が実行中でないことを確認し、Marketplaceルートでディレクトリ全体を一度だけ改名します。新旧の両方を残してはいけません。

```powershell
Move-Item `
  -LiteralPath '.agents\plugin-marketplace-development' `
  -Destination '.agents\marketplace-development'
```

組み立てスクリプトを直接使う場合、`config.json`だけが人間の管理する組み立て設定です。この設定もschema v2だけを受け付け、旧v1を自動変換しません。`schema.json`、`state.json`、二つのカタログ、`plugins/<plugin-name>/`、`skills/<skill-name>/`は生成物なので、直接編集しません。

後述する`agent dev marketplace`で管理する場合は境界が異なります。人が管理する正本は開発マシンの`~/.agents/development.json`であり、Marketplace側の`config.json`も生成物です。二つの方式を同じMarketplaceルートで混在させません。

直接利用する方式の`config.json`はMarketplaceのルートに置かれるため、そのディレクトリやリポジトリへアクセスできる利用者からも読めます。絶対ソースパスにはユーザー名やローカルのディレクトリ構成が含まれる場合があるので、公開するGitリポジトリでは、Marketplaceとソースリポジトリの配置をそろえて相対パスを使い、commit前に設定内容を確認してください。`config.json`に認証情報や秘密情報を記録してはいけません。`agent dev`方式の生成済み`config.json`は、ソースパスを含まず、配布するプラグイン名とカテゴリー、Skill名と任意の来歴URLだけを記録します。

Marketplaceのルートには、ローカルディレクトリ、チェックアウト済みのGitリポジトリ、書き込み可能なNASのUNCパスを指定できます。組み立てスクリプトを直接使う場合は`init`が、`agent dev`方式では最初の`sync`が、不足しているルートや管理ディレクトリを作成します。NASを使う場合、共有への認証、ドライブの割り当て、共有権限の設定はスクリプトの対象外です。

## 前提を確認する

この手順にはNode.jsと、次のスクリプトを含む`plugin-creator-agent-plugins`が必要です。

```text
~/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs
```

追加するプラグインは、ルートにAgent Plugins v1の`plugin.json`を持つ検証可能なパッケージである必要があります。単体Skillはルートに、ディレクトリ名と一致する`name`および空でない`description`をfrontmatterへ持つ`SKILL.md`が必要です。確認時点のOpenAI公式ドキュメントは`.codex-plugin/plugin.json`を使うCodex固有形式も説明しているため、形式の違いは[CodexのAgent SkillsとAgent Pluginsの構成と使い分け](codex-skills-and-plugins.md)を参照してください。このスクリプトはCodex固有形式をAgent Plugins v1へ自動変換しません。

スクリプトを引数なしで実行すると、ファイルを変更せずヘルプを表示します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs"
```

## 最初のMarketplaceを作成する

この節の`init`と次節の`add`は、Marketplace内の`config.json`を正本にして、組み立てスクリプトを直接使う場合の低水準コマンドです。`~/.agents/development.json`を正本にする`agent dev`方式では使わず、後述する`configure`と`sync`を使います。

ここでは、二つのプラグインを`team-plugins`というMarketplaceへまとめます。`<marketplace-root>`、`<first-plugin-root>`、`<second-plugin-root>`は、実際の絶対パスへ置き換えてください。同じ`--category`が、`init`で指定したすべてのプラグインへ適用されます。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" init `
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
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" sync `
  '<marketplace-root>'
```

`sync`は、設定されたすべてのソースを検証し、変更された配布物だけをコピーして、最後にカタログを更新します。同期後は、ファイルを変更しない`check`で、ソース、配布用コピー、カタログ、schema、stateにずれがないことを確認します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" check `
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
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" add `
  '<marketplace-root>' `
  '<new-plugin-root>' `
  --category 'Developer tools'
```

`add`は新しいプラグインを検証して`config.json`へ登録しますが、配布用ファイルはコピーしません。追加後に`sync`と`check`を実行します。

```powershell
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" sync `
  '<marketplace-root>'

node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/assemble-agent-marketplace.mjs" check `
  '<marketplace-root>'
```

スクリプトは`plugin.json`からプラグイン名を取得し、同じ名前のプラグインがすでに登録されていれば追加を拒否します。既存プラグインはソースと内容が同じならコピーを省略するため、NASへの不要な書き込みも抑えられます。

## 単体Skillを配布する

単体Skillは`agent dev marketplace configure`から追加するのが通常の経路です。開発中のSkillには「Use a local project folder」を選び、リポジトリとその中のSkillディレクトリを指定します。この場合、`~/.agents/skills`は参照しません。

他者から導入したSkillを自分の別マシンでも利用するため保存する場合だけ、「Snapshot an installed Skill」を選び、`~/.agents/skills`直下の名前を明示します。CLIは導入済みSkillを自動列挙して一括公開せず、選択した一つだけを配布入力として扱います。これは編集用の正本ではなく、明示的に更新するスナップショットです。

公開リポジトリがある場合は、任意の`sourceUrl`を記録できます。導入済みSkillの`SKILL.md`に`metadata.github-repo`があれば対話時の候補に使います。URLのない社内SkillではEnterで省略でき、後から対話設定で追加、変更、`none`による削除ができます。URLは来歴メモであり、ネットワークから自動取得する指示や、第三者への再配布許可を意味しません。共有カタログへ出るため、認証情報、クエリ文字列、フラグメントを含むURLは拒否します。

日常の全体同期に加えて、一つのSkillだけを検査・同期できます。

```powershell
agent dev marketplace check --skill my-skill
agent dev marketplace sync --skill my-skill
```

共有側には`skills/<skill-name>/`と`.agents/skills/catalog.json`が生成されます。カタログには内容digestと、設定した場合だけ`sourceUrl`が入ります。ローカルのリポジトリパスやホームディレクトリは含みません。Skill内のシンボリックリンクは相対リンクに限り、Skillルート内へ解決できないリンク、壊れたリンク、絶対リンクは同期時と導入時に拒否します。

## 開発と共有を分ける

複数リポジトリや複数Marketplaceを扱う開発環境では、`~/.agents/development.json`をローカルな正本にして、次の共通入口を使えます。初回設定や構成変更は対話式の`configure`で行います。`setup`も同じ操作です。

```powershell
agent dev marketplace configure
agent dev marketplace setup
```

`marketplace`は`mp`へ短縮できるため、日常操作では`agent dev mp check`や`agent dev mp sync`も使えます。利用側も`agent mp skill list`のように書けます。`dev`は開発・配布操作と利用操作の境界を示すため省略せず、正式な説明では`marketplace`を使います。

Marketplaceが一つなら自動選択し、複数なら最初に今回の作業対象を選びます。選択はその対話セッションだけで保持し、メニューから切り替えられます。主メニューは9項目で、数字の代わりに表示された1文字のショートカットも使えます。日常的なプラグインの追加・更新は主メニューに残し、プラグイン開発対象の管理と削除操作はサブメニューにまとめています。

サブメニューでは`b`で主メニューへ戻れます。名前やパスなどの入力途中では`:back`を入力すると、その操作で途中まで入力した変更を破棄して直前のメニューへ戻ります。入力値や接続先の検証に失敗した場合も、その操作だけを破棄してメニューへ戻ります。操作が完了するまでセッション内設定へ反映せず、`s`でセッション全体を保存し、`q`でセッション全体を破棄します。

対話では、`repository-managed`や`direct`などの内部値を覚えて入力する必要はありません。「リポジトリの設定を使う」「プラグインディレクトリを直接使う」のような説明付き選択肢を番号で選びます。version方針も、現在のversionを維持する、ローカル開発用suffixを付ける、`plugin sync`をまだ有効にしない、という実際の効果から選択できます。

「Connect existing Marketplace」には、NASのUNCパスまたは手元に用意済みのMarketplace checkoutを指定します。`agent dev`で管理されたMarketplaceからは名前、表示名、既存エントリーを検証し、ローカルには接続情報だけを安全側の`consumer`モードで保存します。他の開発者の配布用コピーをローカルのソースとして登録しません。`consumer`は単体Skillの閲覧と導入に使えますが、開発用の`check/sync`は拒否します。担当分を更新する開発者だけ、対話設定から`contributor`へ変更します。

この操作はGit版の取得までを行う`clone`ではありません。NASは共有パスを直接参照し、Git Marketplaceは通常のGit手順でcloneしてから、そのcheckoutへ接続します。新しいMarketplaceをローカル設定から全体管理する場合は`authoritative`モードになります。設定の保存だけでは共有先を変更せず、同期準備ができた後に明示的な`check`または`sync`を実行します。

途中から複数人運用へ移す場合は、`configure`の「Change Marketplace management mode」で、1台のPCが全体を管理する`authoritative`から、各担当者が選択したプラグインまたはSkillだけを更新する`contributor`へ切り替えます。利用だけのPCは`consumer`にします。`authoritative`から権限を狭める前には部分指定のない全体`check`と同じ検査を実行します。登録された全ソース、配布用コピー、カタログ、schema、state、管理情報のいずれかにずれがあれば拒否するため、全体`sync`を済ませたうえで切り替えます。その後、既存のローカル割り当てから、このPCが今後更新しない対象を削除します。

逆に`contributor`または`consumer`から`authoritative`へ戻す場合は、共有側にある全プラグインとSkillのソースがローカルの割り当てから解決できることをCLIが確認します。全件が手元にない状態では、全体正本への切り替えを拒否します。`consumer`から`contributor`へ切り替える場合も、共有先への部分更新を許可することを対話で確認します。

`development.json`はschema v2だけを受け付け、試行段階のv1を自動変換しません。旧ファイルは別名で退避し、`configure`で作り直します。既存Marketplaceを引き継ぐ場合は「Connect existing Marketplace」を使います。ここで読み込むMarketplace側の組み立て設定は独立したschemaであり、`development.json`のv1互換処理ではありません。

初回設定後の日常操作は、対象ごとの`check`と`sync`にそろえています。

```powershell
agent dev skill check
agent dev skill sync
agent dev plugin check
agent dev plugin sync
agent dev marketplace check
agent dev marketplace sync
```

`plugin sync`は自分のCodexへ開発版プラグインをインストールまたは更新し、`marketplace sync`は共有Marketplaceへ配布用コピーを反映します。対象が複数ある場合だけ名前を追加し、複数人で分担するMarketplaceでは担当プラグインを`--plugin`、担当Skillを`--skill`で指定します。設定後の日常操作では、内部の管理方式を意識してmanagerを選び直す必要はありません。

```powershell
agent dev marketplace check <marketplace-name>
agent dev marketplace sync <marketplace-name>
```

Marketplaceが一つなら対象名を省略できます。複数ある場合は、`check`と`sync`では対象名を明示します。暗黙の「現在のMarketplace」は保存しません。`configure`では対象が一つなら自動選択し、複数ならメニューで選びます。`configure <marketplace-name>`とすれば、既存対象を初期選択できます。

特定のプラグインだけを同期または検査する場合は、`development.json`に登録したローカル対象名を`--plugin`へ渡します。

```powershell
agent dev marketplace sync <marketplace-name> --plugin <plugin-target>
agent dev marketplace check <marketplace-name> --plugin <plugin-target>

agent dev marketplace sync <marketplace-name> --skill <skill-target>
agent dev marketplace check <marketplace-name> --skill <skill-target>
```

Marketplaceが一つなら、ここでもMarketplace名を省略できます。部分操作は共有側の管理情報を読み、他のエントリーを保持したまま、指定した対象だけを追加または更新します。各開発者は自分の担当分だけをローカル設定へ登録でき、他人のソースリポジトリを用意する必要はありません。ほかの配布物は確認しないため、全体の状態を証明する操作ではありません。

NASを複数人で更新するときは、各人が`--plugin`または`--skill`を付けた部分同期を使い、Marketplace全体の`sync`は全ソースを管理する担当者だけが実行します。同じMarketplaceへの同期はロックディレクトリで直列化され、別の同期中は停止します。異常終了後に`.agents/marketplace-development/agent-dev-sync.lock`が残った場合は、実行中の同期がないことを確認してから、そのディレクトリだけを削除します。低水準の組み立てスクリプトを直接使う場合、この外側のロックは適用されません。

ソースパスを含まない共有側の管理参照は、配布用コピーとカタログの同期に成功した後で更新します。組み立てに失敗した場合は管理参照を先行更新せず、失敗前の内容を維持します。

`development.json`では、Marketplaceの`plugins[].target`と`skills[].target`から上位のローカル対象を参照します。プラグイン対象は、リポジトリ固有の`developmentConfig`を持つ`repository-managed`と、ポータブルな`pluginRoot`を直接指す`direct`に分けます。Skill対象は、リポジトリ内の正本と、明示した導入済みスナップショットに分けます。

`repository-managed`の`plugin check/sync`は、リポジトリ所有のrunnerと設定を通して、ポータブル検証にversion方針、Node.js要件、固有テスト、ローカルMarketplaceの契約を加えます。`direct`の`plugin check`は共通managerによるポータブル検証だけです。`direct`で`plugin sync`を使うには、`development.json`へ`versionPolicy`の`bump`または`keep`を明示し、ソースを指すローカルMarketplaceを共通managerから発見できる必要があります。version方針の省略は、このPCからのインストールを許可していない状態として扱います。

従来形式のMarketplaceから取り込んだ`direct`対象には`versionPolicy`を自動設定しません。取り込んだソースパスが共有側の`plugins/`直下ではないことは検査しますが、それだけで開発ソースだと証明はできないためです。Marketplaceの`check/sync`にはそのまま使えますが、Codexへのインストールは、開発ソースとローカルMarketplaceを確認してversion方針を明示した後だけ行います。どちらの方式でも、`plugin sync`前には同名のユーザースコープスキルがないかを検査します。

`agent dev`は参照を解決し、ソースパスを含む一時的な組み立て定義をローカルで作って、`assemble-agent-marketplace.mjs`の`check`または`sync --config`へ渡します。一時定義は実行後に削除します。Marketplace側の`config.json`にはプラグイン名とカテゴリー、Skill名と任意の来歴URLだけを生成するため、開発マシン固有の絶対パスを共有先へ残しません。`agent`から呼ぶmanagerとvalidatorはインストーラーがCLIと同じ版で配置するため、ユーザースコープのスキルリンクをプラグイン統合確認のために外しても、この入口の実行依存は失われません。

直接利用していた既存`config.json`のMarketplace名、表示名、ソース、カテゴリーが、`development.json`から解決した構成と完全に一致する場合は、最初の`agent dev marketplace sync`でこの生成形式へ移行できます。内容が一致しない場合は停止するため、差分を確認してどちらを正本にするか決めてから再実行します。

ローカルのプラグイン統合には`agent dev plugin check`または`agent dev plugin sync`を使い、共有Marketplaceを暗黙に更新しません。設定方法は[`agent dev`でローカル開発を管理する](../agent-development.md)を参照してください。

スキル中心の日常開発では、プラグイン内の各スキルを`$HOME/.agents/skills`からソースリポジトリへ直接リンクできます。この経路なら、変更のたびにローカルMarketplaceからプラグインを再インストールしたり、Codexのインストール済みキャッシュと開発元を見分けたりする必要がありません。直接リンクの管理方法と重複防止は、[開発中のスキルをユーザースコープへリンクする](../skill-links.md)を参照してください。

Marketplaceの登録と、プラグインのインストールは別の操作です。Marketplaceを登録しただけでは、直接リンクされたスキルと重複しません。同じ`name`のスキルを含むプラグインをインストールすると発見経路と有効な版が重複し得るため、日常開発では直接リンク、プラグイン全体の統合確認ではリンクを無効にした環境でのインストール、というように一方だけを有効にします。直接リンク経由の確認は、プラグインのmanifest、MCPサーバー、クライアント固有拡張、Marketplace、インストール、キャッシュ更新までを通した証拠にはなりません。

ローカルで確認するたびに共有Marketplaceを同期する必要はありません。ソースリポジトリに固有のテストや`local-plugin.mjs validate`がある場合は先に実行し、配布versionを含めて共有してよい状態になった時点で`sync`と`check`を実行します。Marketplaceの組み立て時に行う検証はポータブルなパッケージが対象であり、リポジトリ固有のテストやバージョン更新は含みません。

組み立てスクリプトを直接使い、NAS上の`config.json`に`C:\...`のような絶対ソースパスを記録した場合、そのパスへアクセスできる開発者のPCから同期します。`agent dev`方式では絶対ソースパスを`development.json`だけに保持します。どちらの場合も、共有者はソースリポジトリへアクセスする必要がなく、NASに生成されたMarketplaceを利用するだけです。

`sync`は、Gitのcommitやpush、NASへのログイン、CodexへのMarketplace登録、利用者環境へのインストールを行いません。Gitリポジトリを配布先にする場合は、同期後の差分を確認し、通常のリリース手順でcommitとpushを行います。

## 利用者が単体Skillを導入する

別マシンでは、アクセス可能なMarketplaceルートをローカル設定へ接続した後、単体Skillを一覧表示して`~/.agents/skills`へ導入します。Marketplaceが一つならローカル対象名を省略できます。

```powershell
agent marketplace skill list
agent marketplace skill install my-skill
agent marketplace skill update my-skill
agent marketplace skill remove my-skill
```

Marketplaceが複数ある場合、`install`ではSkill名の後にローカルMarketplace対象名を付けます。`update`は導入時に記録した対象を既定で使います。

```powershell
agent marketplace skill install my-skill team
```

一覧表示は共有側のカタログだけを読み、配布用コピーの全件検査は行いません。`install`と`update`は選択したSkillについてカタログdigestとSkillコピーを照合し、導入状態を`~/.agents/marketplace-skill-state.json`へ記録します。管理外の同名Skillや、導入後にローカル変更されたSkillは上書き・削除しません。Skillディレクトリ自体には管理stateを書かないため、パッケージ内容のdigestを変えません。導入・更新・削除は`~/.agents/.marketplace-skill.lock`で直列化し、一覧表示はロックせず読み取りだけを行います。異常終了後にロックが残った場合は、ほかの変更操作が動いていないことを確認してから、そのディレクトリだけを削除します。

プラグインについて同じキャッシュ機能は実装しません。CodexのMarketplaceとインストール済みプラグインはCodexアプリ／CLIが管理するため、利用者側では次節の公式経路を使います。

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

Marketplaceの構成はどの配布先でも同じです。一つのMarketplaceへ複数のプラグインとSkillを登録できるため、チームや用途ごとに必要なまとまりを作り、パッケージごとのMarketplaceを増やさないようにします。

## 手編集と削除に注意する

`sync`は、前回生成した内容と異なる手編集を検出すると、既存のプラグインコピーやカタログを上書きせず停止します。手作業をソースリポジトリへ移すか、生成物を前回の状態へ戻してから再実行してください。`state.json`を書き換えて検出を回避してはいけません。

プラグインまたはSkillをMarketplaceから外す場合、組み立てスクリプトの直接利用では`config.json`から、`agent dev`方式では`development.json`から対象エントリーを削除して`sync`します。カタログからは外れますが、古い`plugins/<plugin-name>/`または`skills/<skill-name>/`ディレクトリは自動削除されません。削除対象が正しいことを確認してから、別の操作として削除またはアーカイブします。

NASへの同期で、アクセス拒否、接続断、容量・クォータ不足、ファイルの使用中など、判別できるファイルシステムエラーが発生した場合、スクリプトはOSのエラーと対象パスを残し、確認事項を表示して停止します。元のエラーに加えて後始末やロールバックにも失敗した場合は、元の原因を隠さず、追加の失敗として対象パスを表示します。

スクリプトが共有への認証、ドライブの割り当て、権限変更、NASの容量確保を行うことはありません。Windowsから共有へ接続できること、共有とファイルシステムの権限、実行ユーザーの資格情報、空き容量をスクリプトの外で確認し、復旧後に同じコマンドを再実行します。インターネット接続の許可と、UNCパスへのファイル書き込み許可は別の制御です。

同じMarketplaceに対する`init`、`add`、`sync`は同時に実行しないでください。再実行後に独立した確認が必要なら`check`を使います。一時ファイルやバックアップの後始末に失敗したと表示された場合は、示されたパスとMarketplaceの状態を確認してから手動で処理します。

## 参考資料

- [OpenAI「Package your plugin」](https://developers.openai.com/plugins/build/plugins)
- [Agent Plugins v1仕様](https://agent-plugins.org/specification)
- [CodexのAgent SkillsとAgent Pluginsの構成と使い分け](codex-skills-and-plugins.md)
- [`plugin-creator-agent-plugins`](../../plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/SKILL.md)
- [Marketplace組み立て手順](../../plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/references/marketplace-distribution.md)
