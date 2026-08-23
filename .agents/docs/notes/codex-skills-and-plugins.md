# Codexのスキルとプラグインの構成と使い分け

> **確認時点：** 2026年8月23日。OpenAI公式ドキュメント、`openai/codex`の公開ソース、手元のWindows版Codexで確認した内容です。ローカルの保存先や組み込みファイルは、Codexの更新で変わる可能性があります。

Codexでは、スキルを直接使う方法と、スキルをプラグインに含めて使う方法があります。スキルはワークフローの作成形式、プラグインはスキルやMCPサーバーなどを配布・インストール可能な単位にするパッケージ形式です。

## スキルとプラグインの関係

| 項目 | スキル | プラグイン |
| --- | --- | --- |
| 主な役割 | 再利用するワークフローを記述する | スキルやMCPサーバーなどをパッケージ化して配布・インストールする |
| 必須ファイル | `SKILL.md` | `.codex-plugin/plugin.json` |
| 主な構成要素 | `scripts/`、`references/`、`assets/`、`agents/openai.yaml` | `skills/`、`.mcp.json`、`.app.json`、assets、ライフサイクルフック |
| 主な利用範囲 | ユーザー環境またはリポジトリへ直接配置 | Plugins Directory、ワークスペース、ローカルMarketplaceから導入 |

Codexは最初にスキルの名前と`description`を読み、必要と判断したときに`SKILL.md`本文を読み込みます。スタンドアロンのスキルは、Codex CLI、IDE拡張、ChatGPTデスクトップアプリで利用できます。ほかの利用者がインストールできる形で配布するときは、スキルをプラグインに含めます。

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
├── plugin-creator/   # Codexプラグインの構造、manifest、配布設定を作成・更新する
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

確認時点で手元に展開されている`skill-creator`は、保存先を指定しない場合に`$CODEX_HOME/skills`または`~/.codex/skills`を使う手順を含んでいます。一方、現在のOpenAI公式ドキュメントは、ユーザー用とリポジトリ用の作成場所として`.agents/skills`を案内しています。この2つの記述から、将来の既定値や既存パスの廃止までは判断できません。このリポジトリでは、公開元を`$HOME/.agents/skills`に統一しています。

## プラグインの構成と導入

すべてのプラグインは、`.codex-plugin/plugin.json`を持ちます。スキルだけを含む最小構成は次のとおりです。

```text
my-plugin/
├── .codex-plugin/
│   └── plugin.json
└── skills/
    └── my-skill/
        └── SKILL.md
```

必要に応じて、MCPサーバー設定、登録済みMCPサーバーへの参照、ライフサイクルフック、表示用assetsを追加できます。`plugin-creator`はプラグイン構造、manifest、ローカルMarketplace登録を作成・更新します。プラグイン内の個々のスキルは`skill-creator`で作成・検証できます。

ローカルMarketplaceの公式な配置は次のとおりです。

| スコープ | Marketplaceファイル |
| --- | --- |
| リポジトリ | `$REPO_ROOT/.agents/plugins/marketplace.json` |
| ユーザー | `~/.agents/plugins/marketplace.json` |

Marketplaceの`source.path`が、読み込むプラグインディレクトリを指します。公式ドキュメントにある`$REPO_ROOT/plugins/`や`~/.codex/plugins/`は配置例であり、固定の保存先ではありません。

手元のWindows環境では、導入済みプラグインのコピーが`$CODEX_HOME/plugins/cache`に展開されています。確認時点では、`openai-bundled`、`openai-primary-runtime`、`openai-curated-remote`など、供給元を区別する名前のサブディレクトリがあります。これは確認時点のローカル実装であり、公式に固定された配置としては扱いません。ローカルプラグインの開発では、キャッシュではなくMarketplaceの`source.path`が指すディレクトリを編集します。

### `openai/codex`と`openai/plugins`の役割

`openai/codex`の`codex-rs/plugin`と`codex-rs/core-plugins`は、Codexがプラグインを読み込み、管理するためのRustクレートです。前者はmanifest、plugin ID、providerなどの基本モデルと読み込み処理を、後者はMarketplace、インストールと更新、bundle、キャッシュ、同期、hooksなどを扱います。

一方、`openai/plugins`は、実際のプラグイン・パッケージ例とMarketplace定義を公開するリポジトリです。`plugins/<name>/`以下に`.codex-plugin/plugin.json`があり、必要に応じて`skills/`、`.app.json`、`.mcp.json`、hooks、assetsなどが置かれています。

| 場所 | 中身 | Codexでの役割 |
| --- | --- | --- |
| `openai/codex/codex-rs/skills/src/assets/samples/` | `SKILL.md`を中心とするシステムスキル | Codexへ組み込まれ、`$CODEX_HOME/skills/.system`へ展開される |
| `openai/codex/codex-rs/plugin`、`codex-rs/core-plugins` | Rustのプラグイン基盤・管理コード | manifestの解釈、読み込み、Marketplace、インストールや同期などを実行する |
| `openai/plugins/plugins/<name>/` | manifestとskills、MCP、hooks、assetsなどを含むプラグイン例 | Marketplaceから導入できる配布物を構成する |
| `$CODEX_HOME/plugins/cache/<marketplace>/...` | 現在の環境へ導入・展開されたプラグインのコピー | Codexが実際に読み込む。公開リポジトリの`main`と同じ内容とは限らない |

システムスキルの`plugin-creator`は、プラグイン本体ではなく、プラグインの雛形を作るためのスキルです。`openai/plugins`は公開例とMarketplace構成を示すものであり、各環境にインストール済みのプラグインをそのまま列挙したものではありません。

## 用途別の選び方

| 用途 | 選択 |
| --- | --- |
| 自分が複数のリポジトリで使う | `$HOME/.agents/skills`のスキル |
| 特定のリポジトリやディレクトリだけで使う | 対象範囲の`.agents/skills`に置くスキル |
| 既存スキルをローカルで試す | `skill-installer`で導入するスキル |
| 他の利用者がインストールできる形で配布する | スキルを含むプラグイン |
| 複数のスキルをまとめる | プラグイン |
| スキルとMCPサーバーなどをまとめる | プラグイン |

スタンドアロンのスキルは引き続き利用できるため、`openai/skills`リポジトリの非推奨化だけを理由に、正常に読み込まれているスキルをプラグインへ移行する必要はありません。リポジトリ外へ配布する、複数のスキルをまとめる、MCPサーバーなどと一緒に届ける場合にプラグイン化します。

## Codex更新時の注意

`$CODEX_HOME/skills/.system`は、Codexが埋め込みファイルを展開する場所です。Codexの更新でフィンガープリントが変わると書き直されるため、このディレクトリへの直接編集は保持されません。

組み込みスクリプトへの暫定修正を管理する場合は、次を確認します。

- 更新前後の対象ファイルの内容とハッシュ
- 修正前として確認済みのバージョンか
- 上流で修正され、暫定対応が不要になっていないか
- 修正後に検証コマンドが通るか

GitHubの`main`ブランチ、インストール済みCodex、ローカルへ展開されたファイルは、同じ内容とは限りません。現在の挙動はローカルのファイルで確認し、出所や変更内容は対応するリリースまたはコミットと照合します。

## 参考資料

### 公式ドキュメント

- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Build skills for plugins](https://developers.openai.com/plugins/build/skills)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)

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
