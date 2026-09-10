# ai-dotfiles

CodexやAIエージェント向けの設定例、`AGENTS.md`、スキルをまとめたプラグイン、管理用の`agent`コマンドを公開する個人用dotfilesリポジトリです。必要なものを選んで利用できます。

A personal dotfiles repository for shareable Codex and AI agent settings, instructions, plugins, and the `agent` CLI.

設定は個人の利用環境に合わせたものです。そのまま一括適用せず、ファイルアクセス、ネットワーク、環境変数に関する許可を確認してください。説明ノートに記載した確認時点・対象環境にも注意してください。

## 提供しているプラグイン・スキルとコマンド

プラグイン名のリンク先には導入方法と使い方、スキル名のリンク先にはAIが読む指示があります。

- **[agent-design-tools](plugins/agent-design-tools/README.md)**：指示と作業の進め方を設計するプラグイン。
  - [prompt-design](plugins/agent-design-tools/skills/prompt-design/SKILL.md)：新しいプロンプトや`AGENTS.md`を書くとき、既存の指示が曖昧・矛盾していて期待する回答や動作にならないときに使います。AIへ伝える目的、条件、出力の要件を整理し、利用するモデルに合わせて指示を見直します。複数の局所修正を比較しやすい場合は「修正前／修正後／理由」で報告する調整を加えています。固定の出力形式ではなく、全面的な書き直しやファイル編集では変更規模と依頼に合わせます。
  - [agent-workflow-design](plugins/agent-design-tools/skills/agent-workflow-design/SKILL.md)：定期的な確認や長時間の開発など、繰り返し・継続して行う作業の進め方を設計するときに使います。複数のツールやエージェントの役割分担、待機・中断・再開の条件、実行記録を踏まえた改善を検討します。通常の作業を実行するだけなら不要です。後の保守に改善候補や判断理由を残す必要がある場合は、`~/.agents/notes/`の利用も検討できるようにしています。既存の保存先を優先し、採用が認められた範囲で使う任意のローカル規約であり、常時ログを記録する仕組みではありません。
- **[agent-plugin-tools](plugins/agent-plugin-tools/README.md)**：ポータブルなプラグインを作るための汎用スキルとツール。
  - [plugin-creator-agent-plugins](plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/SKILL.md)：スキルやMCPサーバーをポータブルなプラグインにまとめるとき、既存パッケージを検証・移行するとき、配布用のMarketplaceを作るときに使います。パッケージ構成の確認からローカルでの導入確認まで、依頼した範囲を同梱ツールで支援します。`agent` CLIなしでも利用できます。
- **[ai-dotfiles-cli](plugins/ai-dotfiles-cli/README.md)**：このリポジトリのCLI操作をAIへ案内するプラグイン。
  - [ai-dotfiles-cli](plugins/ai-dotfiles-cli/skills/ai-dotfiles-cli/SKILL.md)：`agent`で管理しているスキルリンクやプラグインの状態を調べるとき、自分の担当分を共有Marketplaceへ同期するとき、Codexの保守やセッション整理を行うときに使います。導入済みCLIのコマンドと確認手順を選び、操作結果を確かめます。CLI自体の開発や汎用的なプラグイン作成は対象外です。
  - [codex-history](plugins/ai-dotfiles-cli/skills/codex-history/SKILL.md)：以前にエクスポートした会話から、過去の決定理由を探したり、複数のセッションにまたがる経緯を確認したりするときに使う、実験的なスキルです。保存済みファイルを検索・参照し、根拠の場所と記録の不足を示します。進行中の会話の取得や、エクスポート・削除・復元は行いません。
- **[agentコマンド](#agentコマンド)**：スキルとは別に実行する管理用CLI。
  - [`agent dev`](docs/agent-development.md)：開発対象の確認・同期、共有Marketplaceの設定・配布。
  - [`agent marketplace`](docs/agent-development.md#別マシンで単体skillを利用する)：プラグインに含めず個別に配布されたスキルの一覧表示・導入・更新・削除。
  - [`agent codex`](docs/agent-codex.md)：Codexの状態確認・修復、セッション整理、書き出した会話の検索・参照。

CLIはプラグインなしでも動作します。`ai-dotfiles-cli`プラグインにCLI本体は含まれず、それぞれを別々に導入・更新します。

`prompt-design`と`agent-workflow-design`は、現在、OpenAI／Codex向けで対象モデルが未指定の場合、GPT-6 Astraのモデルガイドを設計の基準にしています。別の対象モデルが指定されている場合や既存の利用環境から分かる場合は、そのモデルに合わせます。Gemini向けのプロンプトでは専用のリファレンスを読み分けます。これは設計時の参照先の選択であり、実行中のモデルを切り替えるものではありません。

## Codex環境

公開用の設定ファイルは[`home/`](home/)にあります。ファイル本体と、設定の意味・注意点を説明するノートを次にまとめています。

- **ユーザー設定**：[config.toml本体](home/.codex/config.toml)
  - [ユーザー設定とプロジェクト設定の分け方](docs/notes/codex-config-toml.md)
  - [新規チャットにモデル設定が反映されない場合](docs/notes/codex-new-chat-model-selection.md)
- **Browser設定**：[browser/config.toml本体](home/.codex/browser/config.toml)
  - [設定項目と安全上の注意](docs/notes/codex-browser-config-and-security.md)
- **Git操作の設定と問題への対処**
  - [CodexにGit変更操作を任せる場合の設定](docs/notes/git-operations.md)
  - [WindowsでGitへの書き込みが拒否される場合](docs/notes/codex-windows-git-write-acl-recovery.md)

`home/.codex/config.toml`は公開用のコピーで、このリポジトリ自体に適用する`.codex/config.toml`とは別です。コピーの方向や変更方法は、後述の[設定の公開用エクスポート](#設定の公開用エクスポート)を参照してください。

## ~/.codex/AGENTS.md

Codexへ渡す共通指示の例です。回答の詳しさ、待機中の進め方、ブラウザーの選択、ファイルの読み込みなどに関する方針をまとめています。リポジトリには、ホーム側の`~/.codex/AGENTS.md`から書き出したコピーを置いています。

- [~/.codex/AGENTS.md](home/.codex/AGENTS.md)：共通指示の本文。
- [指示の日本語訳と設計理由](docs/notes/codex-agents-md-instruction-rationale.md)
- [変更時の評価方針と確認範囲](docs/notes/codex-agents-md-evaluation.md)

## スキル

このリポジトリのスキルは、冒頭の各プラグイン内で管理しています。個別に導入する場合も、`SKILL.md`だけでなく、必要なリファレンスやスクリプトを含むスキルディレクトリ単位で扱います。開発元を直接参照して使う「スキルリンク」なら、編集のたびに利用先へコピーする必要はありません。

- **選び方・使い分け**
  - [Agent SkillsとAgent Pluginsの構成と使い分け](docs/notes/codex-skills-and-plugins.md)
  - [組み込みのskill-creatorと、prompt-design・agent-workflow-designの役割分担](docs/notes/skill-creator-prompt-design-agent-workflow-design.md)
- **開発中のスキルを使う**
  - [スキルリンクの登録・変更・検査・解除](docs/skill-links.md)：開発フォルダーをコピーせず、`~/.agents/skills/`から参照する方法。
  - 同名スキルの直接リンクとインストール済みプラグインは併用せず、日常のスキル開発とプラグイン全体の動作確認で切り替えます。
- **利用者ごとの設定・保守記録**
  - [スキルの設定を外部に置く考え方](docs/notes/agents-config-local-convention.md)
  - [保守記録を残す考え方](docs/notes/agents-notes-local-convention.md)
  - いずれも標準仕様ではなく、対応するスキルや運用で採用するローカルな案・規約です。

## プラグイン

提供する3つのプラグインはAgent Plugins v1形式です。導入は各プラグインのREADME、パッケージの作成や開発環境の準備は次の資料を参照してください。

- [プラグイン作成・検証・移行のガイド](plugins/agent-plugin-tools/README.md)：`agent` CLIに依存しない汎用ツールと導入方法。
- [agent devによる開発対象の設定と管理](docs/agent-development.md)：登録したローカル開発元の検証とCodexへのインストール・更新。
- [agent-plugin-toolsの設計・レビュー記録](docs/agent-plugin-tools/astra-review.md)

プラグインは[`plugins/`](plugins/)内のソースを編集し、利用先へ配布・更新します。インストール済みコピーやCodexのキャッシュを開発用に直接編集しません。

## マーケットプレイス

複数のプラグインをまとめて配布する場所としてMarketplaceを使います。このリポジトリのツールでは、プラグインに含めずスキルを個別に配布することもできます。その場合は、スキルの配布用コピーと独自カタログを同じMarketplace内に置きます。

- **作成・配布する**
  - [プラグインやスキルをNASやGitへ配布する仕組み](docs/notes/agent-marketplace-distribution.md)
  - [agent devで接続先・担当範囲を設定する](docs/agent-development.md#初回設定と更新)
  - [ローカルと共有先の状態確認・検査・同期](docs/agent-development.md#使い方)
- **配布されたものを利用する**
  - プラグイン：利用するクライアントのプラグイン機能から導入します。[Marketplaceの配布ノート](docs/notes/agent-marketplace-distribution.md)にCodexでの手順があります。
  - 個別に配布されたスキル：[`agent marketplace skill`による導入・更新・削除](docs/agent-development.md#別マシンで単体skillを利用する)を参照してください。

## agentコマンド

`agent`を使うと、複数のリポジトリで開発するスキル・プラグインを共通のコマンドで確認・更新し、NASなどの共有Marketplaceへ同期できます。ai-dotfilesが提供するCLIで、公式の`codex`コマンドとは別です。

Node.js 24以降が必要です。macOS／Linuxへの対応は実験的で、実機での動作は未検証です。

- **導入・更新**：[インストール手順](docs/agent-development.md#配置とインストール)
  - WindowsのPATH登録とmacOS／Linuxの導入方法を案内しています。
  - CLIのインストールだけでは、スキルや利用者の設定は作成されません。
- **開発・配布の操作**：[`agent dev`の利用ガイド](docs/agent-development.md#使い方)
  - 開発対象の一覧は`agent dev status`、スキルリンクの管理メニューは`agent dev skill link`です。
- **Codexの保守**：[`agent codex`と単体スクリプトの利用ガイド](docs/agent-codex.md)
  - [セッションを期間指定でアーカイブ・削除・エクスポートする](docs/agent-codex.md#manage-codex-sessionsmjs)
  - [書き出した会話を検索・参照する](docs/agent-codex.md#manage-codex-historymjs)
  - [セッションの保護条件・エクスポートの内容と制限](docs/notes/codex-session-management.md)

導入後は`agent`で概要、`agent dev skill`などで各機能のヘルプを表示できます。`agent codex`と`agent dev skill link`は端末では対話メニューを開くため、説明だけ読む場合は`--help`を付けます。各スクリプトをNode.jsやPowerShellから直接実行する方法も、利用ガイドにあります。

Codexの保守には操作ごとのOS・バージョン制限があります。`agent codex session`によるセッション管理と、`agent codex history`による保存済み会話の検索・参照は実験的な機能です。エクスポートは参照用のコピーであり、復元可能なバックアップではありません。変更操作の前に、検証範囲と安全条件を確認してください。

## 設定の公開用エクスポート

自分のdotfilesを公開する場合は、[設定のエクスポートガイド](docs/export.md)を参照してください。対象は[`export.yaml`](export.yaml)で指定し、[`export.js`](export.js)で機密情報の候補を検査してから書き出します。検査だけで誤公開を完全に防げるわけではないため、書き出した差分は人が確認します。

コピー方向は「ホームディレクトリ → このリポジトリの`home/`」です。`home/`を編集しても利用中の設定へは反映されず、次の書き出しで上書きされる場合があります。変更を継続して使う場合は、先にホーム側の元ファイルへ反映してください。これは設定ファイルの公開用書き出しであり、`agent codex session export`による会話の保存とは別の操作です。

利用者の開発対象を記録する`~/.agents/ai-dotfiles/development.json`は公開しません。`~/.agents/ai-dotfiles/skill-links.json`は、このリポジトリ内を参照する宣言だけを公開用コピーへ書き出します。

## リポジトリの開発・検証

変更前に[開発ルール](AGENTS.md)を確認してください。主なファイル配置は次のとおりです。

- [`home/`](home/)：ホームから取り込んだ公開用の設定・スクリプト。
- [`plugins/`](plugins/)：スキル・プラグインのソース。
- [`tools/agent/`](tools/agent/)：CLIのソース。利用環境への反映にはインストーラーを再実行します。
- [`scripts/`](scripts/)：CLIのインストーラーとリポジトリの検証用スクリプト。
- [`docs/`](docs/)：利用ガイド、設計理由、検証・評価の説明。
- [`evals/`](evals/README.md)：評価入力・応答・manifestの記録。

検証にはNode.js 24以降を使い、Windowsではインストーラーのテスト用にPowerShell 7（`pwsh`）も必要です。次のコマンドはリポジトリのルートで実行します。

- `npm run check`：エクスポート計画のドライラン、CLI・スキルリンク・プラグイン管理ツールのテスト、プラグインの構造・配布テストを実行します。
- `npm run check:plugins`：3つのプラグインの構造と、CLI関連パッケージの同梱リンク・汎用ツールの単体起動を検証します。

`npm run check`では設定ファイルを書き出しません。実際に書き出す`npm run build`は、[エクスポート手順](docs/export.md#使い方)に従い、コピー元と書き出し予定を確認してから実行してください。

スキルの設計変更と評価結果は、[prompt-designの評価](docs/prompt-design/README.md)、[agent-workflow-designの設計・評価](docs/agent-workflow-design/README.md)、[評価記録の一覧](evals/README.md)からたどれます。構造テストの成功と、実際のモデルの動作を評価した結果は区別して記録しています。
