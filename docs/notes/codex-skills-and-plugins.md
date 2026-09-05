# CodexのAgent SkillsとAgent Pluginsの構成と使い分け

> **確認時点：** 2026年9月3日。[Agent Skills仕様](https://agentskills.io/specification)、[Agent Plugins v1仕様](https://agent-plugins.org/specification)、OpenAI公式ドキュメント、`openai/codex`の公開ソース、手元のWindows版Codexで確認した内容です。仕様、ローカルの保存先、CLI、組み込みファイルは更新で変わる可能性があります。

Codexでは、Agent Skillを直接使う方法と、Agent SkillをAgent Pluginに含めて使う方法があります。Agent Skillは、必要なときに読み込む手順・判断基準・付属リソースの形式です。Agent Pluginは、Agent SkillsやMCPサーバーを一つの配布・インストール単位にまとめるportableなパッケージ形式です。Codex Marketplace、インストール状態、キャッシュはCodex側の配布・実行レイヤーであり、portable packageそのものではありません。

判断時は、次の三層を分けます。

| 層 | 正本とする仕様・実装 | 主に決めること |
| --- | --- | --- |
| Agent Skill | Agent Skills仕様 | `SKILL.md`、frontmatter、`scripts/`、`references/`、`assets/` |
| Portable Agent Plugin | Agent Plugins v1仕様 | ルート`plugin.json`、直下`skills/`、ルート`mcp.json`、documented client extensions |
| Codex integration | 現在のOpenAI公式ドキュメント、CLI help、インストール結果、新しいタスクでの発見 | Marketplace登録、インストール、キャッシュ、Codex固有機能 |

2026年8月28日時点のOpenAI公式「Package your plugin」は、依然として`.codex-plugin/plugin.json`、`.mcp.json`、`.app.json`を使うCodex固有形式を説明しています。一方、手元のCodex CLI 0.150.1はルート`plugin.json`だけのAgent Plugins v1 packageをMarketplace経由でインストールし、含まれるスキルを発見できています。この不一致は、portable仕様とCodex固有資料を別々の証拠として扱います。Portable sourceへ念のため`.codex-plugin/plugin.json`を併置せず、対象Codexで実際に検証します。

## スキルとプラグインの関係

| 項目 | スキル | プラグイン |
| --- | --- | --- |
| 主な役割 | 再利用するワークフローを記述する | スキルやMCPサーバーをパッケージ化して配布・インストールする |
| Portable形式の必須ファイル | `SKILL.md` | ルート`plugin.json` |
| Portable形式の主な構成要素 | `scripts/`、`references/`、`assets/`、その他の付属ファイル | `skills/`、`mcp.json`、documented client extensions |
| Codex固有・任意の要素 | `agents/openai.yaml` | Marketplace定義、インストール設定、Codexが文書化したextensionや互換package |
| 主な利用範囲 | ユーザー環境またはリポジトリへ直接配置 | Plugins Directory、ワークスペース、ローカルMarketplaceから導入 |

Codexは最初にスキルの名前と`description`を読み、必要と判断したときに`SKILL.md`本文を読み込みます。スタンドアロンのスキルと、プラグイン内のスキルは、同じAgent Skills形式を使います。違うのはスキル自体の形式ではなく、発見経路、配布単位、version管理、同梱できるportable componentです。

### Agent Skillの仕様境界

Agent Skillは、親ディレクトリ名と一致する`name`、何を行い、いつ使うかを示す`description`をfrontmatterに持つ`SKILL.md`があれば成立します。`license`、`compatibility`、`metadata`、experimentalな`allowed-tools`は仕様上の任意項目です。`scripts/`、`references/`、`assets/`も、実際に必要な場合だけ追加します。

```text
my-skill/
├── SKILL.md          # 必須
├── scripts/          # 決定的な処理を繰り返し実行する場合
├── references/       # 必要な場面だけ読む詳細資料
└── assets/           # 成果物へ使うテンプレートや素材
```

`agents/openai.yaml`はCodexやOpenAIのUI metadata、依存関係、呼び出しpolicyを記述する任意のclient metadataです。Agent Skills仕様の必須ファイルでも、Agent Plugins v1のcore componentでもありません。OpenAI以外のclientでも使うスキルでは、これが理解されない可能性を前提に、`SKILL.md`だけでもportableな指示として成立させます。

スキルを単独配置からプラグインへ移しても、`SKILL.md`以下の形式は変えません。プラグインの`skills/`直下へ、各スキルを直接配置します。Agent Plugins v1は、その直下にある`SKILL.md`だけをplugin-provided skillとして発見し、さらに深い子孫を再帰的に別スキルとして発見しません。

### `openai/skills`リポジトリの非推奨化

`openai/skills`は、コミット[`778b0e6`](https://github.com/openai/skills/commit/778b0e6)で非推奨とされました。コミット本文は「Move users towards Plugins directory for skills and apps.」で、READMEには現在のCodex向けスキルおよびプラグインの例として`openai/plugins`を参照するよう追記されています。

このコミットが直接示すのは、`openai/skills`リポジトリの非推奨化と案内先の変更です。スキル機能の廃止は記載されていません。現在のOpenAI公式ドキュメントも、スタンドアロンのスキルを引き続き案内しています。

## 組み込みスキルの導入元

### 公開ソース

`codex-rs`は、`openai/codex`リポジトリ内にあるRust実装のディレクトリです。別の製品名ではありません。公開されているシステムスキルのソースは、`codex-rs/skills/src/assets/samples/`で確認できます。

確認時点で手元の`$CODEX_HOME/skills/.system`に展開されているシステムスキルは、次の6つです。行末は、それぞれの`SKILL.md`にある役割の要約です。

```text
$CODEX_HOME/skills/.system/
├── imagegen/         # ラスター画像を生成・編集する
├── openai-docs/      # OpenAI製品とCodexの公式情報を調査・案内する
├── plugin-creator/   # Codex固有形式のplugin構造、manifest、配布設定を作成・更新する
├── review-agent/     # 委任されたコード変更を読み取り専用でレビューする
├── skill-creator/    # Codexスキルを作成・更新する
└── skill-installer/  # キュレーション済みリストやGitHubリポジトリからスキルを導入する
```

これはシステムスキルだけの一覧です。ユーザースキル、リポジトリ内のスキル、プラグインが提供するスキルは含みません。

`skill-creator`と`plugin-creator`は別々のシステムスキルです。`plugin-creator`は`skill-creator`を内包していませんが、検証時に兄弟ディレクトリの`skill-creator/scripts/quick_validate.py`を利用します。

### Codexへの組み込みとローカル展開

`codex-rs/skills/src/lib.rs`は、システムスキルをCodex実行ファイルへ埋め込みます。Codexは埋め込まれたファイルを`$CODEX_HOME/skills/.system`へ展開します。

```text
openai/codexのシステムスキル
        ↓ ビルド時に埋め込み
Codex実行ファイル
        ↓ ローカルへ展開
$CODEX_HOME/skills/.system
```

`.codex-system-skills.marker`には、埋め込まれたシステムスキル一式のフィンガープリントが保存されます。この値はGitのコミットIDやCodexのバージョン番号ではありません。フィンガープリントが一致しない場合、既存の`.system`は削除され、実行ファイル内のシステムスキルが書き直されます。

## ローカルスキルの読み込み場所

OpenAI公式ドキュメントでは、Codexが次のスコープからスキルを読み込むと説明しています。

| スコープ | 場所 | 用途 |
| --- | --- | --- |
| リポジトリ | `$CWD/.agents/skills`から`$REPO_ROOT/.agents/skills`まで | 特定のディレクトリまたはリポジトリで共有する |
| ユーザー | `$HOME/.agents/skills` | 複数のリポジトリで使う |
| 管理者 | `/etc/codex/skills` | マシンやコンテナで共有する |
| システム | Codexに同梱。手元の実装では`$CODEX_HOME/skills/.system`へ展開 | OpenAIが提供する組み込みスキル |

確認時点で手元に展開されている`skill-creator`は、保存先を指定しない場合に`$CODEX_HOME/skills`または`~/.codex/skills`を使う手順を含んでいます。一方、現在のOpenAI公式ドキュメントは、ユーザー用とリポジトリ用の作成場所として`.agents/skills`を案内しています。この2つの記述から、将来の既定値や既存パスの廃止までは判断できません。この環境では、スタンドアロンとして管理するユーザースキルの配置先を`$HOME/.agents/skills`に統一しています。プラグインに収録したスキルはここへ複製せず、Marketplaceが指すプラグインソースを正本とします。

## リポジトリ所有スキルを複数の作業場所から使う

スキルと、そのスキルが操作するCLIや設定を同じリポジトリで開発する場合、スキルの正本をリポジトリに置き、`$HOME/.agents/skills`には正本を指すsymbolic linkを置けます。Symbolic linkを利用できる環境では、コピーを同期する仕組みを別に持つ必要がありません。

```text
tool-project/
└── skills/
    └── my-skill/                    ← Gitで管理する正本
        ├── SKILL.md
        ├── scripts/
        ├── references/
        └── assets/

$HOME/.agents/skills/my-skill       ← Codexのユーザースコープで発見
  → tool-project/skills/my-skill
```

Windowsでは、symbolic linkの作成に開発者モードや適切な権限が必要になる場合があります。セットアップコマンドは作成失敗を明示し、通常ディレクトリへのcopyへ黙って切り替えません。Directory junctionなどをfallbackとして採用する場合も、正本と発見用entryの関係を利用ノートへ明記します。

リポジトリ内だけで自動発見させたい場合は、正本を`$REPO_ROOT/.agents/skills/<skill-name>`に置けます。一方、将来プラグインの`skills/`へそのまま収めることや、セットアップコマンドが発見経路を明示的に管理することを優先するなら、正本を`$REPO_ROOT/skills/<skill-name>`に置き、ユーザー領域からlinkする構成も選べます。重要なのはディレクトリ名そのものではなく、正本を一つにし、どの仕組みがスキルを発見可能にするかを明示することです。

### Link作成はセットアップコマンドにする

手作業のlink作成は、向きの取り違え、別cloneへの接続、既存ディレクトリの上書きを起こしやすいため、リポジトリ側に`npm run skill:link`などのセットアップコマンドを用意します。コマンドには次の性質を持たせます。

- OSのhome directoryを実行環境から取得し、ユーザー名や絶対パスをsourceへ埋め込まない
- link先の正本を`realpath`で確定する
- 正しいlinkがすでにある場合は成功として終了する
- 通常のディレクトリやファイルを勝手に削除・置換しない
- 既存linkが別の場所を指す場合も、自動修復せず差異を報告する
- 作成後にlink種別と解決先を確認できるようにする

このコマンドはローカル開発環境の登録手段です。リポジトリをcloneしただけでユーザー領域を書き換えるinstall scriptとして自動実行せず、利用者が明示的に実行する形にします。

### スキル実体から付属toolchainを解決する

スキルが同じリポジトリにあるCLIや設定を使う場合、発見されたスキルの表示上のパスではなく、スキルに付属するresolver script自身の実体パスを`realpath`で解決できます。Resolverは実体パスから親をたどり、`package.json`、schema、設定ファイル、必要なcommandなど、そのtoolchain固有の複数の印でrootを検証します。

```text
明示されたroot
  ↓ 見つからない場合
現在のrepositoryとその親
  ↓ 見つからない場合
resolver実体のrealpathとその親
  ↓ 見つからない場合
toolchainなしのstandalone mode
```

この順序なら、home全体や兄弟repositoryを毎回探索せずに済みます。探索範囲が狭いため、速度、再現性、privacyの面でも扱いやすくなります。明示されたrootが不正な場合は黙って別候補へfallbackせず、設定間違いとして報告したほうが安全です。

Resolverが保証するのは、候補が期待するtoolchainか、現在利用可能かという範囲です。次は別々に判断します。

- スキルを発見できたか
- 付属toolchainを解決できたか
- 今回のタスクでtoolchainを使う必要があるか
- 対象リポジトリや出力先へ書き込む権限があるか

たとえば、toolchainを解決できても、単独のSVG生成で十分ならstandalone modeを選べます。反対に、管理された成果物や検証工程が必要でも書き込み権限がなければ、rootを見つけたことだけを根拠に変更してはいけません。

### ローカル開発と配布を分ける

Repository-owned skillとユーザー領域からのsymbolic linkは、頻繁に変更する個人開発や、toolchainとスキルを一緒に検証する段階に向いています。ただし、これは第三者へのインストール、更新、runtime配布を解決する形式ではありません。

| 段階 | 推奨構成 | 解決すること |
| --- | --- | --- |
| リポジトリ内だけで使う | `$REPO_ROOT/.agents/skills` | そのリポジトリ内での発見と共有 |
| 複数リポジトリでローカル開発する | Repository-owned skill＋`$HOME/.agents/skills`からのsymbolic link | 正本を一つにしたままユーザースコープで発見 |
| スキルだけを第三者へ配布する | Skills-only plugin | インストール、version管理、更新 |
| スキルと実行機能をまとめて配布する | Skill＋local MCP serverを含むplugin | スキルとtoolchain repository側の操作境界を一緒に登録 |

Skills-only pluginはスキルの配布を解決しますが、別途cloneされた任意のtoolchain repositoryの場所までは自動的に解決しません。Toolchainを同梱する、またはtoolchain repository側の操作を安定した境界から提供する必要がある場合は、pluginにlocal MCP serverを含め、skillから宣言済みのMCP toolを呼ぶ構成が候補になります。

一方、repository-owned skillをsymbolic linkで使う段階では、rootを見つけるためだけにMCP serverやsession hookを導入すると、process、権限、trust review、保守対象が増えます。この段階ではsymbolic linkとread-only resolverで十分かを確認し、pluginとしてrepository外へ配布するときにMCP境界の必要性を改めて判断します。

### 安全性と検証

ユーザースコープのsymbolic linkは、link先のスキル更新を複数の作業場所へ即座に反映します。これは開発には便利ですが、信頼していないrepositoryをlinkすると、そのrepositoryの指示やscriptもユーザースコープから利用可能になります。Link先は自分が管理するrepositoryに限定し、source reviewなしに外部repositoryへ接続しません。

最低限、次の状況を独立にテストします。

- Toolchain repository内から実行し、現在のrepositoryを解決する
- 無関係なrepositoryからlink経由で実行し、スキル実体側のrootを解決する
- Resolverだけを別の場所へcopyし、toolchainなしとして終了できる
- 明示rootが不正な場合に失敗する
- 正しいlinkへの再実行が冪等である
- 通常ディレクトリ、別targetへのlink、切れたlinkを勝手に置換しない

このパターンを使う場合、利用ノートには少なくとも正本の場所、linkの向き、セットアップcommand、root解決順、standalone時の挙動、書き込み権限との境界を記録します。

## プラグインからリポジトリ側を呼び出すMCP境界

この節では、CLIや設定を所有する側を**toolchain repository**、そのCLIで原稿や成果物を処理する側を**作業対象repository**と呼び分けます。

要点は、repository-owned skillをsymbolic linkで使う段階ではスキル内resolverがtoolchain rootを解決し、同じスキルをpluginへ収録する段階では、その責務をMCP bridge側へ移すことです。

ここでMCPを検討する主な理由は、一般的にtoolを増やすことではありません。Repository-owned skillと同じ内容をpluginへ収録すると、インストールされたスキルの実体はpluginのinstall先に置かれ、開発元のtoolchain repository内へ`realpath`で戻れなくなります。Skills-only pluginでは、別途cloneされているtoolchain repositoryの場所も、そこで提供されるCLIの呼び方も解決できません。

Plugin化にMCPが仕様上必須という意味ではありません。Plugin内のスキルがmachine-local設定からtoolchain rootを読み、CLIを直接実行する構成も作れます。ただし、スキルからpath探索とshell commandの詳細を外し、型付き操作、入力検証、権限制御、構造化結果を共有したい場合は、local MCP serverをtoolchain repositoryへのbridgeにする構成が適しています。このノートでは、その構成を推奨案として扱います。

そのため、ローカル開発とplugin配布では、toolchain repositoryへ到達する経路を分けます。

```text
ローカル開発
$HOME/.agents/skillsのlink
  → repository-owned skill
  → skill実体のrealpath resolver
  → repository CLI

Repository連携型のPlugin
plugin内skill
  → 宣言されたMCP tool
  → local MCP bridge
  → 検証済みtoolchain rootのCLIまたはlibrary API
```

後者では、MCPサーバーがpluginとtoolchain repositoryの境界になります。以降、この役割を担うlocal MCP serverを**MCP bridge**と呼びます。スキルはtoolchain pathを探索したり、任意のshell commandを組み立てたりせず、`get_context`、`preflight`、`build`、`validate`のような安定したtoolを呼びます。MCP bridge側がtoolchain rootと作業対象repositoryを別々に検証し、CLIまたはlibrary APIを決められた引数で実行します。

スキル、MCP、プラグインの担当は次のように分かれます。

| 構成要素 | 主に担当すること | 単独では解決しないこと |
| --- | --- | --- |
| スキル | 依頼の解釈、判断順、workflow、品質基準、toolの使い分け | 安定した実行APIやruntimeの配布 |
| MCPサーバー | 型付きの操作、入力検証、権限制御、データ取得、実行結果の返却 | どの場面で何を選ぶかという執筆・作業方針 |
| プラグイン | スキル、MCP設定、assets、hooksなどの配布と導入 | 含めた機能自体の設計品質 |

スキルが「対象を確認してpreflightし、問題がなければbuildする」と判断し、MCPサーバーがその操作をtoolchain repository側へ安全に中継します。プラグインは、スキル、MCP設定、必要なbridge runtimeを一緒にインストールできる形へまとめます。

### Repository連携型とruntime同梱型

ここで使う「repository連携型」と「runtime同梱型」は、このノートで構成を区別するための説明用の呼称であり、OpenAI公式のplugin種別名ではありません。

Portable Agent Pluginはルート`plugin.json`を必須manifestとして持ち、MCPサーバーを提供する場合だけルート`mcp.json`を追加します。`mcp.json`にMCPサーバー設定を含めると、スキルとtoolchain repository側の操作機能を一つの配布単位として登録できます。次の`mcp.json`は構造を示す概念例です。実際の`command`をplugin内のruntime、PATH上のcommand、外部repositoryのどれとして解決するかは、pluginの実行環境で別途確認します。

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "my-toolchain": {
      "type": "stdio",
      "command": "my-toolchain-mcp",
      "args": ["--stdio"]
    }
  }
}
```

Agent Plugins v1の`command`はshell command文字列ではなく、一つの実行可能tokenです。Pluginに同梱する実行ファイルは`./`から始まるplugin-relative path、外部commandはbare executable nameを使います。`args`、`env`、`cwd`では`${PLUGIN_ROOT}`と`${PLUGIN_DATA}`を使えますが、package pathは解決後もplugin rootまたはclient-managed data rootの内側に収めます。

スキル側の`agents/openai.yaml`では、必要なMCP toolへの依存を宣言できます。

```yaml
dependencies:
  tools:
    - type: "mcp"
      value: "my-toolchain"
      description: "Inspect, build, and validate managed artifacts"
```

この依存宣言はMCP toolを示すものであり、任意のローカルrepository pathを登録する一般的なdependencyではありません。Repositoryと接続する方法は、配布形態によって二つに分かれます。

| 方式 | MCPサーバーの役割 | Repositoryの扱い |
| --- | --- | --- |
| Repository連携型 | Plugin同梱または登録済みのbridgeが、明示設定されたrootを検証してtoolchain repository側のCLIを呼ぶ | 利用者が別途clone・更新する |
| Runtime同梱型 | Pluginに同梱したtoolchain runtimeをMCP経由で呼ぶ | 外部のtoolchain repositoryを必要としない |

開発初期はrepository連携型にすると、CLIとスキルを頻繁に変更しながら同じsourceを検証できます。ただし、pluginのinstall先にあるskill実体から任意のclone先を推測してはいけません。MCP bridgeは、利用者が明示したローカル設定ファイルや環境変数などからrootを受け取り、複数の固有ファイルやcommandで正しいtoolchainかを検証します。

Toolchain repositoryのcloneやNode.js依存を利用者へ要求しない配布を目指す場合は、toolchain runtimeをpluginへ同梱するruntime同梱型へ進めます。この場合もskillはMCP toolだけを見ればよく、toolchain repositoryのpath解決は不要です。

したがって、移行の中心は次のとおりです。

```text
開発中: symlink＋skill内resolver
    ↓ plugin化
移行初期: plugin内skill＋MCP bridge側resolver
    ↓ runtime同梱が必要になった場合
自己完結配布: plugin内skill＋plugin同梱MCP runtime
```

## MCP bridgeを設計するときの補足

### Toolchain連携をMCPにする判断

既存CLIをMCPで包む価値が高いのは、次のような場合です。

- 同じ操作を複数のスキルやagentから繰り返し使う
- 引数、対象root、出力先、許可する操作をschemaで制限したい
- Read-only操作と変更操作を明確に分けたい
- CLIの長いstdoutではなく、構造化された結果やartifact参照を返したい
- Toolchainをpluginと一緒に配布し、利用者に実体pathを意識させたくない
- Shell commandの組み立てやplatform差をMCPサーバー側へ閉じ込めたい

反対に、次の場合はスキルから既存CLIを直接使うほうが小さく保てます。

- 操作が少なく、CLI contractが十分安定している
- 対象repository内だけで利用する
- Root resolverだけで所在の問題を解決できる
- MCP process、schema、version互換性を維持するほどの再利用がない
- Agentが受け取るべき結果をCLIで短く決定的に返せる

MCP化は既存CLIを捨てる理由にはなりません。CLIをcanonicalな実行層として保ち、MCPサーバーを薄いfacadeにすると、人間、CI、スキル、MCPで同じ処理を共有できます。ただし、CLIの任意command文字列をそのまま渡す`run_command`のようなtoolは、型付き境界や権限制御の利点を失います。公開するのは、利用目的と副作用が明確な操作に限定します。

### トークン効率は構成名だけでは決まらない

「スキル」と「plugin＋MCP」のどちらが常に少ない、という固定関係ではありません。Pluginは配布形式なので、同じ`SKILL.md`をsymbolic linkから読むか、Skills-only pluginから読むかだけでは、モデルが読む内容は大きく変わりません。Pluginに含まれるruntimeやassetsの全体が、そのままモデルのcontextへ入るわけでもありません。

一方、MCPを加えるとtool schemaとtool往復が増えますが、スキル内の長いCLI説明、shell commandの組み立て、stdoutの解析、失敗時の探索を減らせる場合があります。したがって、初回に追加される情報だけでなく、タスク完了までの総量で比較します。

```text
総トークン量のおおまかな比較軸
  = 読み込まれたスキル指示とreference
  + Codexへ提示されたtool schema
  + tool argumentsと返却結果
  + 失敗、再試行、回復のための追加context
```

| 構成 | トークン効率がよくなりやすいケース | 増えやすいケース |
| --- | --- | --- |
| Repository-owned skill＋直接CLI | 操作が少なく、commandと出力が短く決定的 | 長いCLI手順をスキルへ持ち、stdout解析や再試行が多い |
| Skills-only plugin＋直接CLI | 同じスキルを配布形式だけ変えたい | 外部toolchainの探索やCLI説明が残る |
| Plugin＋MCP bridge | 同じ型付き操作を繰り返し、短い構造化結果で判断できる | Tool数が多い、schemaが冗長、細かな往復や巨大な結果が多い |
| Plugin＋同梱MCP runtime | Repository連携型と同じ小さなtool interfaceを保てる | Runtime同梱を理由にtool surfaceや返却量まで増やす |

単発で短いCLIを1、2回実行するだけなら、repository-owned skill＋直接CLIが通常は最も小さくなります。複数の作図で`context`、`preflight`、`build`、`validate`を繰り返し、同じ検証とerror handlingを安定させる場合は、MCP bridgeのschemaと構造化結果が追加コストを相殺し、タスク全体では効率的になる可能性があります。

Repository連携型とruntime同梱型の差は、主にinstall、起動、依存管理の差です。同じMCP tool interfaceと返却内容を使う限り、この二つのトークン効率は大きく変わりません。MCP serverの起動時間、CPU、memory、process管理は実行コストですが、トークン消費とは分けて評価します。

トークン効率を保つMCP設計では、次を優先します。

- Toolを内部commandごとではなく、利用者の安定した目的ごとに分ける
- 名前、説明、schemaを短く明確にし、重複した注意を各toolへ繰り返さない
- 一覧や診断結果へfilter、limit、paginationを持たせる
- 巨大なSVG、log、binaryを常に本文で返さず、要約と必要なartifact参照を返す
- 成功時は判断に必要な情報だけを返し、詳細logは要求時に取得できるようにする
- 複数回の細かい往復が必須になるtool分割を避ける

正確なトークン量は、Codexのversion、toolの公開方法、実際に選択されたスキル、応答内容によって変わります。設計段階の推測だけで決めず、同じ代表タスクをCLI経路とMCP経路で実行し、入力context、tool回数、返却文字量、成功率を比較します。

### データ境界と権限

MCPはprotocolであり、「MCPだからlocal」「MCPだからexternal」という意味ではありません。Stdioで起動するlocal MCPサーバーでも、その実装がnetwork APIへ接続すればデータは外部へ送られます。反対に、local filesとlocal processだけを扱い、network accessを持たない実装なら、処理をローカルに閉じられます。

導入前に次を確認します。

- MCPサーバーの実行形式がlocal stdioかremote endpointか
- Tool arguments、対象ファイル、原稿、生成物のどれがサーバーへ渡るか
- サーバー自身がnetworkへ接続するか
- 認証情報をどこから取得し、どこへ保存するか
- Read-only toolと変更toolが分離されているか
- 外部送信、公開、削除などに人間の確認が必要か
- Logやerrorへ機密データを残さないか

PluginへMCPサーバーを含めても、この確認は省略できません。Plugin manifestは配布物の構成を示しますが、MCP server implementationの通信先や副作用まで自動的に安全にするものではありません。

### MCP経路の検証

Skill＋MCPを配布する場合は、スキル単体の評価に加えて次を確認します。

- MCPサーバーなし、起動失敗、version不一致を区別して説明できる
- Tool schemaが無効な引数、範囲外のpath、未許可の出力先を拒否する
- 同じ入力に対するCLI経路とMCP経路の意味が一致する
- Read-only toolがsourceやworkflow stateを変更しない
- 変更toolが対象、成果物、診断結果を構造化して返す
- 大きな結果をboundedに返し、必要な詳細だけ後から取得できる
- Agentがtool失敗時に無制限に再試行しない
- MCPなしで維持するstandalone modeが必要なら、そのfallbackを独立に評価する

## プラグインの構成と導入

Agent Plugins v1に準拠するすべてのportable pluginは、ルート`plugin.json`を持ちます。スキルだけを含む最小構成は次のとおりです。

```text
my-plugin/
├── plugin.json
└── skills/
    └── my-skill/
        └── SKILL.md
```

最小manifestは次の形です。Agent Plugins v1.0.0の`plugin.json`はclosed schemaであり、component pathをmanifestへ列挙しません。スキルは`skills/`、MCPサーバーは`mcp.json`という固定位置から発見されます。

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin"
}
```

Portable core componentはAgent SkillsとMCPサーバーの二つです。Hooks、commands、custom agents、LSP、UI、Marketplace metadataはAgent Plugins v1のportable componentではありません。Client固有機能が必要な場合は、そのclientが所有・文書化したreverse-domain namespaceを`extensions`や同名のトップレベルディレクトリに使うか、portable sourceとは別の派生packageとして管理します。Plugin作者が独自namespaceを作っても、clientがその機能を認識するわけではありません。

この環境では、Agent Plugins v1 packageの作成・更新・検証に`plugin-creator-agent-plugins`を使います。組み込み`plugin-creator`は、確認時点では`.codex-plugin/plugin.json`を作るCodex固有形式を案内しているため、portable Agent Plugins v1の正本を作る用途には使いません。プラグイン内の個々のスキルを作成・構造変更するときは`skill-creator`を併用します。

### 個人用`plugin-creator-agent-plugins`スキル

この環境では、`~/.agents/skills/plugin-creator-agent-plugins/`をユーザースコープの発見入口とし、そこからリンクするソースリポジトリ内のスキルを正本とします。組み込み`plugin-creator`を書き換えるpatchではなく、portable形式を選ぶタスクで併用・代替する独立スキルです。現在のスキルversionは`0.5.0`です。開発中の作業コピーを固定する場合はGit commitまたは内容を固定したartifactを使い、公開・配布後はtemplateや生成結果を変える更新でversionを上げます。

主なreferenceの分担は次のとおりです。

| ファイル | 担当 |
| --- | --- |
| `references/authoring.md` | ルートmanifest、plugin-contained skills、MCP、client extensionの作成・保守 |
| `references/validation.md` | Portable conformance、contained skill、target clientを分けた検証 |
| `references/codex-migration.md` | `.codex-plugin/plugin.json`中心のCodex固有packageからAgent Plugins v1へ移す一度きりの構造変更 |
| `references/codex-integration.md` | Portable source完成後のMarketplace登録、インストール、更新、snapshot、新しいタスクでの反復確認 |
| `references/marketplace-distribution.md` | 複数のプラグインや単体Skillをローカル、Git、NAS上の一つのMarketplaceへ集約する |
| `references/repository-management.md` | Repository固有のテストやversion方針を持つ自己完結したローカル管理入口の生成・更新 |

付属scriptは、`scripts/validate-agent-plugin.mjs`がAgent Plugins v1 packageをread-onlyで検証し、`scripts/manage-local-agent-plugin.mjs`がローカルプラグインの状態確認、検証、Marketplace経由の再インストール、snapshotと実キャッシュの照合を行います。`scripts/scaffold-local-agent-plugin.mjs`は、このmanager、validator、JSON SchemaをRepositoryへ配置し、Repository固有の設定を`.agents/plugin-development/<plugin-name>.json`へ分離します。`scripts/assemble-agent-marketplace.mjs`は、複数のソースリポジトリまたは明示した導入済みSkillから、ローカルディレクトリ、Gitリポジトリ、NAS上の共有Marketplaceを生成・更新します。プラグインはCodex用カタログ、単体Skillは`agent`用カタログへ分離します。複数のプラグインがある場合もRepository管理設定はプラグインごとに分け、runner、validator、schemaは共有します。共通runnerのテストはスキル側にだけ置き、各Repositoryには複製しません。`scripts/check-builtin-plugin-creator.mjs`は、組み込み`plugin-creator`の説明がAgent Plugins v1へ対応したかをread-onlyで分類します。`check-builtin-plugin-creator.mjs`は組み込み指示の監査であり、Codex runtimeの対応可否を証明しません。

ローカルMarketplaceの公式な配置は次のとおりです。

| スコープ | Marketplaceファイル |
| --- | --- |
| リポジトリ | `$REPO_ROOT/.agents/plugins/marketplace.json` |
| ユーザー | `~/.agents/plugins/marketplace.json` |

Marketplaceの`source.path`が、読み込むプラグインディレクトリを指します。公式ドキュメントにある`$REPO_ROOT/plugins/`や`~/.codex/plugins/`は配置例であり、固定の保存先ではありません。

### ローカルMarketplaceへの登録と公開は別

ローカルまたはリポジトリMarketplaceは、Codexが参照するカタログ兼導入元です。`codex plugin marketplace add <ローカルルート>`は、そのMarketplaceソースをCodexへ登録・追跡させる操作であり、プラグイン本体をインターネットへアップロードしたり、共通のPlugins Directoryへ公開したりする操作ではありません。公開やChatGPTワークスペース内での共有は、それぞれ別の工程です。

既定の個人用Marketplaceである`~/.agents/plugins/marketplace.json`は暗黙に検出されます。別の場所にあるリポジトリまたはローカルMarketplaceは、初回に登録し、その後は同じMarketplace名を使います。登録状況と解決されたローカルルートは`codex plugin marketplace list`で確認できます。

複数のプラグインや単体Skillを一つのMarketplaceへまとめ、NASやGitリポジトリで共有する場合は、[Agent MarketplaceでプラグインとSkillをNASやGitへ配布する](agent-marketplace-distribution.md)を参照してください。各リポジトリを通常の正本として保ち、明示した導入済みSkillだけをスナップショットとして扱い、共有用コピー、カタログ、利用者のインストール先を分けて更新する手順を説明しています。

### ローカル開発の二つの経路

ローカル開発では、書き込み可能なソースリポジトリを正本にします。`marketplace.json`はカタログ定義であり、インストール済みプラグインの作業コピーではありません。スキル中心の日常開発と、プラグイン全体の統合確認では、同じ正本から異なる発見経路を使います。

手元のWindows環境では、導入済みプラグインのコピーが`$CODEX_HOME/plugins/cache`に展開されています。確認時点では、`openai-bundled`、`openai-primary-runtime`、`openai-curated-remote`など、供給元を区別する名前のサブディレクトリがあります。これはCodexが管理するインストール先であり、公式に固定された配置としても、開発元の正本としても扱いません。キャッシュやMarketplace定義からソースリポジトリへ逆コピーしません。

スキルの指示や参照を反復して編集するときは、プラグイン内の各スキルを`$HOME/.agents/skills/<name>`からソースへ直接リンクできます。Codexはユーザースコープのスキルとシンボリックリンクを探索するため、この経路ではインストール済みキャッシュを介さずにソースの変更を確認できます。詳しい管理方法は、[開発中のスキルをユーザースコープへリンクする](../skill-links.md)を参照してください。

```text
日常のスキル開発
  ソースリポジトリ
    → $HOME/.agents/skillsから直接リンク
    → Repository固有の検証
    → 新しいCodexタスクで確認

配布・プラグイン統合確認
  ソースリポジトリ
    → package、Repository固有check、配布versionを確認
    → Marketplaceへ同期またはローカルMarketplaceからインストール
    → Codexの管理領域へ反映
    → 新しいCodexタスクで確認
```

Marketplaceの登録は、カタログをCodexへ認識させる操作であり、プラグインのインストールとは別です。登録だけなら直接リンクとの発見経路は重複しません。同じ`name`の直接リンクとインストール済みプラグインを併用すると、正本が一つでも発見経路と有効な版が重複し得ます。Codexは同名スキルを統合しないため、優先関係には依存せず、同じ環境では一方だけを有効にします。

ローカル更新では、まずportableなルート`plugin.json`、各Agent Skill、存在する場合の`mcp.json`を検証します。直接リンク経由の確認は、プラグインのmanifest、MCPサーバー、クライアント固有拡張、インストール、キャッシュ更新を通した統合確認の代わりにはなりません。統合確認が必要な場合は、同名スキルの直接リンクを外した環境でプラグインをインストールします。Repositoryがversionをcache freshnessに使う方針なら、install時だけルート`plugin.json`のversionを一度更新し、`codex plugin add <plugin-name>@<marketplace-name>`で再インストールします。`status`や`validate`でversionを書き換えたり、cachebusterのために`.codex-plugin/plugin.json`を復活させたりしません。実行中のタスクには開始時に読み込んだ指示が残る可能性があるため、確認は新しいタスクで行います。

単純なAgent Plugins v1 packageでは、`plugin-creator-agent-plugins`の共通入口を直接使えます。

```console
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/manage-local-agent-plugin.mjs" status <plugin-root>
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/manage-local-agent-plugin.mjs" validate <plugin-root>
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/manage-local-agent-plugin.mjs" install <plugin-root> --bump-version
```

`status`と`validate`は読み取り専用です。直接リンクを使う日常開発では`validate`までを通常の入口とし、`install`はリンクを無効にした環境でプラグイン統合を確認するときだけ使います。`install`はportable packageを検証し、必要な場合だけローカルMarketplaceを登録して再インストールし、Codexのsnapshot、実キャッシュ、ソースを照合します。既存versionが`+agent.<timestamp>`形式なら次回から自動更新し、新しいRepositoryでは`--bump-version`または`--keep-version`の選択を求めます。

### 利用側の`plugin-management`スキル

`plugin-creator-agent-plugins`がportable packageの作成、検証、配布を扱うのに対し、`plugin-management`は既存プラグインを利用する側の発見、接続、権限、依存関係、削除を扱います。2026年8月31日に手元で確認した`openai-curated-remote`版の指示では、まず利用可能な組み込み機能、次に接続済みプラグインを選び、外部サービスやデータソースが必要で既存の手段ではアクセスできない場合にだけ、新しいプラグインを検索・提案します。

提案はインストールや接続の完了を意味しません。接続状態を確認してからプラグインの機能を使い、接続待ちの間も外部連携を必要としない作業は続けます。権限変更はユーザーが依頼した範囲に限り、削除は明示的な依頼がある場合だけ行います。OpenAI公式ドキュメントでも、Plugins Directoryからのインストールと、必要な外部サービスへの接続・権限承認は別の段階として説明されています。

`plugin-management`の`SKILL.md`は、Plugin Management appをいつ使うかという判断と安全境界を定めるもので、プラグインパッケージを作成・検証する機能そのものではありません。プラグイン内のモデル向け指示は`prompt-design`、反復・長期実行する利用フローは`agent-workflow-design`の対象になり得ますが、発見・接続管理とは責務を分けます。両スキルとの関係は、[skill-creator、prompt-design、agent-workflow-designの役割と使い分け](skill-creator-prompt-design-agent-workflow-design.md)も参照してください。

Repository固有のテストやversion方針を毎回同じ入口から使う場合は、次のscaffoldでRepository所有の`local-plugin.mjs`とプラグインごとの設定を生成します。生成されたrunner、validator、schemaはスキル側のテンプレートから明示的にrefreshし、Repository固有の変更は設定または設定から呼ぶ別scriptに置きます。`refresh`は内容が変わった生成ファイルだけを更新します。`refresh --check`はファイルを変更せず、テンプレートとのバイト単位の差分だけを検出します。portable packageとRepository固有checkの検証は`node scripts/local-plugin.mjs validate`で別に行います。CIでは、開発中ならGit commitまたは内容を固定したartifactを、公開後なら更新されたスキルversionを固定します。設定が一つならrunnerが自動選択し、複数ある場合は`--config .agents/plugin-development/<plugin-name>.json`で対象を明示します。

実行環境からRepositoryの`.agents/`配下へ書き込めない場合は、別の場所を正本にせず、`prepare`で明示した書込み可能な場所へpending設定を作ります。`prepare`が書き込むのは明示したpending設定だけで、Repository内のscaffold生成物は作成・更新せず、既存出力も上書きしません。対象プラグインの設定がすでにある場合は、通常の`import`では置き換えられないため、`prepare`も早期に拒否します。利用者には、そのpending設定を指定して`import`を実行してもらいます。`import`はプラグイン名から正式な設定ファイル名を決め、生成ファイルを配置して検証します。既存設定や変更済み生成ファイルは上書きせず、検証に失敗した設定のコピーは取り消し、pending設定自体は削除しません。書込みが`EACCES`または`EPERM`で失敗した場合は、scaffold自身もコマンドに応じた復旧方法を表示します。pending設定も安全に作れない場合だけ、`init`または個別のPowerShell手順を示します。

```console
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/scaffold-local-agent-plugin.mjs" init <repository-root> <plugin-root> --bump-version
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/scaffold-local-agent-plugin.mjs" prepare <repository-root> <plugin-root> <pending-output> --bump-version
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/scaffold-local-agent-plugin.mjs" import <repository-root> <pending-config>
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/scaffold-local-agent-plugin.mjs" refresh <repository-root>
node "$HOME/.agents/skills/plugin-creator-agent-plugins/scripts/scaffold-local-agent-plugin.mjs" refresh <repository-root> --check
```

設定内の固有テストは`command`と`args`を分け、Repository内の`cwd`から`shell: false`で実行します。MCPの代表tool call、生成物、公開処理などをmanagerが推測して追加することはありません。既存の専用scriptがこの設定で表せない保証を持つ場合は、同等性を確認できるまで置き換えません。

### Agent Plugins仕様とOpenAIの公開資料の役割

`openai/codex`の`codex-rs/plugin`と`codex-rs/core-plugins`は、Codexがプラグインを読み込み、管理するためのRustクレートです。前者はmanifest、plugin ID、providerなどの基本モデルと読み込み処理を、後者はMarketplace、インストールと更新、bundle、キャッシュ、同期、hooksなどを扱います。

`agent-plugins.org`の仕様とschemaは、portable Agent Plugins v1 packageの規範です。一方、OpenAI公式「Package your plugin」と`openai/plugins`の公開例は、確認時点では`.codex-plugin/plugin.json`、`.app.json`、`.mcp.json`、hooksなどを使うCodex固有packageを説明しています。これらはCodexの機能やMarketplaceを理解する証拠ですが、portable Agent Plugins v1 manifestの規範として読み替えません。

| 場所 | 中身 | 主な役割 |
| --- | --- | --- |
| `agent-plugins.org/specification` | ルート`plugin.json`、`skills/`、`mcp.json`、client extensionsの規範 | Portable packageとconformant clientの契約 |
| `agentskills.io/specification` | `SKILL.md`と付属resourceの規範 | スタンドアロンおよびplugin-contained skillの共通形式 |
| `openai/codex/codex-rs/skills/src/assets/samples/` | `SKILL.md`を中心とするシステムスキル | Codexへ組み込まれ、`$CODEX_HOME/skills/.system`へ展開される |
| `openai/codex/codex-rs/plugin`、`codex-rs/core-plugins` | Rustのプラグイン基盤・管理コード | manifestの解釈、読み込み、Marketplace、インストールや同期などを実行する |
| `developers.openai.com/plugins`、`openai/plugins/plugins/<name>/` | Codex固有manifestとskills、MCP、hooks、assetsなどの資料・例 | Codex固有package、Marketplace、公開工程を説明する |
| `$CODEX_HOME/plugins/cache/<marketplace>/...` | 現在の環境へ導入・展開されたプラグインのコピー | Codexが実際に読み込む。公開リポジトリの`main`と同じ内容とは限らない |

システムスキルの`plugin-creator`は、プラグイン本体ではなく、Codex固有形式の雛形を作るためのスキルです。公開資料、組み込みskill、CLI command availability、実際のインストール、cache snapshot、新しいタスクでのcomponent発見は、別の問いへ答える証拠です。一つが成功しただけで未検証のCodex versionや公開surfaceまで一般化せず、不一致は対象versionと確認方法を添えて記録します。

## 用途別の選び方

| 用途 | 選択 |
| --- | --- |
| 自分が複数のリポジトリで使う | `$HOME/.agents/skills`のスキル |
| 特定のリポジトリやディレクトリだけで使う | 対象範囲の`.agents/skills`に置くスキル |
| プラグイン内のスキルを反復開発する | ソースリポジトリを正本にして`$HOME/.agents/skills`から直接リンクする |
| 既存スキルをローカルで試す | `skill-installer`で導入するスキル |
| 少数の安定したCLI操作をagent workflowから使う | スキル＋既存CLI |
| 型付き操作、権限制御、構造化結果を複数workflowで共有する | スキル＋MCPサーバー |
| 他の利用者や複数clientへportableに配布する | Agent Skillsを含むAgent Plugins v1 package |
| 複数のスキルをまとめる | Agent Plugins v1 package |
| スキルとMCPサーバーをまとめて配布する | `skills/`と`mcp.json`を含むAgent Plugins v1 package |
| Codex固有のhooks、UI、登録済みapp連携を配布する | OpenAIが文書化したCodex固有packageまたはdocumented extensionを別途検討する |

スタンドアロンのスキルは引き続き利用できるため、`openai/skills`リポジトリの非推奨化だけを理由に、正常に読み込まれているスキルをプラグインへ移行する必要はありません。リポジトリ外へ配布する、複数のスキルをまとめる、MCPサーバーなどと一緒に届ける場合にプラグイン化します。

Plugin内の`skills/<name>/`を`$HOME/.agents/skills/<name>/`から直接リンクすれば、pluginをインストールせずスタンドアロンとして反復開発できます。この場合も正本はリンク先のソースリポジトリだけです。ただし、同じスキルを含むプラグインを並行してインストールすると、発見経路と有効な版が重複します。Installed cacheからスタンドアロンへコピーせず、日常開発では直接リンク、配布・統合確認ではリンクを無効にした環境でプラグインをインストールするように切り替えます。

## Codex更新時の注意

`$CODEX_HOME/skills/.system`は、Codexが埋め込みファイルを展開する場所です。Codexの更新でフィンガープリントが変わると書き直されるため、このディレクトリへの直接編集は保持されません。

組み込みスクリプトへの暫定修正を管理する場合は、次を確認します。

- 更新前後の対象ファイルの内容とハッシュ
- 修正前として確認済みのバージョンか
- 上流で修正され、暫定対応が不要になっていないか
- 修正後に検証コマンドが通るか

GitHubの`main`ブランチ、インストール済みCodex、ローカルへ展開されたファイルは、同じ内容とは限りません。現在の挙動はローカルのファイルで確認し、出所や変更内容は対応するリリースまたはコミットと照合します。

## 参考資料

### Portable仕様

- [Agent Skills仕様](https://agentskills.io/specification)
- [Agent Skillsのbest practices](https://agentskills.io/skill-creation/best-practices)
- [Agent Plugins v1仕様](https://agent-plugins.org/specification)
- [Agent PluginsのJSON Schemas](https://agent-plugins.org/schemas)
- [Agent Pluginを作成する](https://agent-plugins.org/plugin-authors/build-an-agent-plugin)

### OpenAI公式ドキュメント

- [Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins)
- [Plugins](https://learn.chatgpt.com/docs/plugins)
- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Build skills for plugins](https://developers.openai.com/plugins/build/skills)
- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)（確認時点ではCodex固有の`.codex-plugin/plugin.json`形式を説明）

### OpenAIの公開リポジトリ

- [Codexのシステムスキル一覧](https://github.com/openai/codex/tree/main/codex-rs/skills/src/assets/samples)
- [Codexのシステムスキル組み込み処理](https://github.com/openai/codex/blob/main/codex-rs/skills/src/lib.rs)
- [Codexのプラグイン基盤（`codex-rs/plugin`）](https://github.com/openai/codex/tree/main/codex-rs/plugin)
- [Codexのプラグイン管理（`codex-rs/core-plugins`）](https://github.com/openai/codex/tree/main/codex-rs/core-plugins)
- [skill-creator](https://github.com/openai/codex/tree/main/codex-rs/skills/src/assets/samples/skill-creator)
- [plugin-creator](https://github.com/openai/codex/tree/main/codex-rs/skills/src/assets/samples/plugin-creator)
- [`openai/skills`を非推奨にしたコミット](https://github.com/openai/skills/commit/778b0e6)
- [OpenAI Plugins](https://github.com/openai/plugins)
- [非推奨となったOpenAI Skills](https://github.com/openai/skills)
