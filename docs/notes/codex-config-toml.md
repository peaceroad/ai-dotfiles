# Codexの`config.toml`をユーザー設定とプロジェクト設定に分ける

Codexの設定は、全体で共通する既定値を`~/.codex/config.toml`へ置き、特定のリポジトリやサブフォルダーだけで必要な差分を`.codex/config.toml`へ置けます。承認方針を全体で維持しながら、モデルやファイルシステム権限などをプロジェクト単位で変えたい場合に、この設定レイヤーを使います。

このノートでは、設定の読み込み順と役割、自動レビューに承認判断を任せる設定を説明します。あわせて、`approval_policy = "never"`を維持したまま、特定のプロジェクトでCodexにGit変更操作を任せる例も示します。

Codexアプリの権限メニューや、既存タスクが保持する承認設定も含めた確認は、[Codexアプリで承認設定が反映されないときの確認と対処](codex-desktop-permission-diagnostics.md)を参照してください。設定ファイル同士の優先順位だけで、アプリのタスクの実効値を判断することはできません。

## 設定ファイルの役割

`~/.codex/config.toml`はユーザー全体の既定値です。通常は、承認方針、既定のPermission profile、モデル、機能フラグなど、複数のプロジェクトで共有する設定を置きます。

リポジトリ内の`.codex/config.toml`は、そのプロジェクトの上書きや追加設定です。プロジェクトルートから現在の作業ディレクトリまでに複数ある場合は、作業ディレクトリに近い設定が優先されます。プロジェクト設定は、Codexで信頼済みと判断されたプロジェクトだけで読み込まれます。

主な優先順位は次のとおりです。

1. CLIフラグと`--config`による指定
2. プロジェクトの`.codex/config.toml`
3. 選択したプロファイルファイル
4. `~/.codex/config.toml`

Permission profileも同じ設定レイヤーに従います。上位の設定は、同じプロファイル名の項目をすべて書き直さず、必要なエントリーだけ追加または置換できます。

## 承認方針と操作権限を分けて考える

`approval_policy`は、Codexがコマンド実行前に承認を求める条件を制御します。`approval_policy = "never"`は承認プロンプトを表示しない設定であり、ファイルやネットワークへのアクセスを追加する設定ではありません。

実際に操作できる範囲は、Permission profileのファイルシステム規則やネットワーク規則で決まります。したがって、`never`を維持したままGit操作を許可する場合は、承認方針を変更せず、使用中のPermission profileへ対象リポジトリの`.git`に対する`write`を追加します。許可された範囲の操作は承認なしで実行されるため、対象パスと依頼する操作の両方を限定します。

Permission profileはベータ機能です。`default_permissions`と`[permissions]`を使う方式は、旧方式の`sandbox_mode`や`[sandbox_workspace_write]`と併用しません。通常は、読み込まれる設定に`sandbox_mode`があるか、CLIで`--sandbox`を指定すると旧方式が優先されます。ただし、Codex 0.138.0以降で管理側の`allowed_permission_profiles`が適用される場合は、名前付きプロファイルが使われます。設定を追記する前に、[管理設定](https://learn.chatgpt.com/docs/enterprise/managed-configuration)と実効値も確認してください。

## Auto-reviewに承認判断を任せる

承認が必要な操作を自動で審査するには、ユーザー設定のトップレベルに次の2行を置きます。Permission profileは、用途にあわせて選択したものを維持します。

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
```

`approval_policy`は承認を求める条件、`approvals_reviewer`はその審査担当です。`approvals_reviewer = "user"`ではユーザーが判断し、`"auto_review"`では別のレビュー用エージェントが判断します。`approval_policy = "never"`では承認要求が発生しないため、自動レビューは行われません。

自動レビューで承認されれば作業は続行します。拒否された場合は、より安全な代替手段で進めるか、ユーザーに確認します。すでに許可された範囲内の操作は審査対象外であり、この設定だけで書き込み先や通信先の許可範囲が広がるわけではありません。Computer Useのアプリへのアクセス承認など、直接ユーザーに確認するものも残ります。詳細は[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review)を参照してください。

追加権限を求めるコマンド実行ツールでは、エージェントが実行時の引数に`sandbox_permissions = "require_escalated"`を指定する場合があります。Auto-reviewはその承認要求を審査します。この指定はツールの引数であり、`config.toml`へ追加するキーではありません。

Auto-reviewを有効にしても、通常の実行に必要な読み取り権限が不要になるわけではありません。たとえば、`:root`や`:minimal`はファイルシステムのアクセス範囲を定める項目で、承認要求の審査とは役割が異なります。サンドボックスの準備段階で停止し、承認要求まで進めない場合は、Auto-reviewによる解決を期待できません。

### ポリシーの追加と置き換え

通常は`[auto_review]`を指定せず、標準ポリシーを使います。カスタマイズする場合、`extra_policy`は主ポリシーに追加する指示、`policy`は既存のレビューポリシーを置き換える本文です。どちらもMarkdownの文字列で、管理者設定に対応するポリシーがある場合はそちらが優先されます。[公式設定リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference)で適用条件を確認してください。

設定方法をコメントとして残す場合は、次のように書けます。

```toml
# 自動レビューのポリシー。通常は省略し、標準ポリシーを使う。
# カスタマイズ時は、テーブル宣言と使用する項目のコメントを外す。
# [auto_review]

# 主ポリシーに追加する指示。
# extra_policy = """
# ここに追加の指示を記述する。
# """

# 既存ポリシーを置き換える場合のみ指定する。
# 適用中のポリシー全文を複製し、既存の規則を維持して編集する。
# 本文を用意してから有効にする。
# policy = """
# ここに置き換え後のポリシー全文を記述する。
# """
```

`approvals_reviewer`はトップレベルに置き、`[auto_review]`の中へ移しません。テーブル宣言以降のキーは次のテーブル宣言までそのテーブルに属するため、上の例はトップレベル設定が終わった後、`[features]`などの既存テーブルの直前へ置きます。これにより、コメントを外した際に`default_permissions`などを誤って`auto_review`の項目にすることを防げます。

### ChatGPTサインイン時の無料化

[Tibo氏（@thsottiaux）の「Day 2.1/」で始まる発表](https://x.com/thsottiaux/status/2107368734981517634)では、ChatGPTアカウントでサインインする全ユーザーについて、Auto-reviewを無料化し、プランの利用枠を消費しないとしています。この無料化の説明は自動レビュー自体を対象としており、主エージェントの通常の作業やAPIキーでの利用まで無料になるという意味ではありません。

無料化の発表直後のため、[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security#automatic-approval-reviews)には、追加のモデル呼び出しによってCodexの利用量が増える可能性があるという従来の説明が残っています。このノートでは、提供された投稿本文と出典URLに基づき、ChatGPTサインイン時の扱いを上記の発表に沿って記載しています。

## 特定のプロジェクトでGit変更を許可する

次の例は、`~/.codex/config.toml`で名前付きのPermission profileを選択している環境を前提とします。

```toml
approval_policy = "never"
default_permissions = "workspace-with-agents"
```

`workspace-with-agents`は、この環境で定義したプロファイル名です。対象リポジトリの`.codex/config.toml`へ、同じプロファイル名と`.git`の絶対パスを指定します。

```toml
[permissions.workspace-with-agents.filesystem]
"C:/work/my-project/.git" = "write"
```

`C:/work/my-project`は対象リポジトリの絶対パスに置き換えます。既に同じテーブルがある場合は、パスの行だけを追加します。ユーザー設定にある`approval_policy`や`default_permissions`をプロジェクト設定へ複製する必要はありません。

絶対パスを使うため、この設定は端末固有です。リポジトリの`.gitignore`へ次を追加し、ローカル設定をコミット対象から外します。

```gitignore
/.codex/
```

既に`.codex/`内のファイルを追跡している場合、この指定だけでは追跡が解除されません。チームでプロジェクト設定を共有する場合は、端末固有の絶対パスを含めずに成立する構成を別途設計します。

この指定は`.git`全体への書き込みを許可します。`commit`だけを許可するようなGitコマンド単位の制御ではありません。`push`など外部リポジトリへ影響する操作は、ローカルの書き込み権限とは別に依頼の範囲を決めます。

## 設定を反映して確認する

設定を保存したら、Codexを再起動するか新しいタスクを開始し、対象リポジトリを作業ルートとして開きます。別のプロジェクトを作業ルートにしたタスクから対象パスを操作しても、そのリポジトリの`.codex/config.toml`がプロジェクト設定として読み込まれるとは限りません。

確認は次の順で行います。

1. 有効なPermission profileが、プロジェクト設定で追記した名前と一致していることを確認する。
2. `.git`への書き込みが実効権限に含まれることを確認する。
3. 必要なブランチ作成やコミットを依頼し、終了コードと実際のGit状態を確認する。

`git status`や`git diff`は読み取り操作なので、それだけでは書き込み権限を確認できません。確認用のGit変更を行う場合も、作業ファイルと履歴を元の状態へ戻せる内容に限定します。

## WindowsでMXCを優先する

Microsoft Execution Containers（MXC）は、Windowsのプロセス隔離機能を使うサンドボックスの実行方式です。2026年10月25日時点の[公式Windows sandboxガイド](https://learn.chatgpt.com/docs/windows/windows-sandbox)では、対応端末での利用を推奨しています。従来の`elevated`方式と異なり、管理者承認を伴うセットアップ、専用Windowsアカウント、ローカルのファイアウォールルールを必要としません。

MXCを優先し、利用条件を満たさない場合は`elevated`を使う例です。

```toml
[features]
# 端末と管理ポリシーが対応していればMXCを優先する。
prefer_mxc = true

[windows]
# MXCを利用できない場合に使う従来方式。
sandbox = "elevated"
```

既存の`[features]`と`[windows]`があれば、それぞれの中へキーを追加・更新します。同じテーブルを重複して定義しないでください。`prefer_mxc`は`[features]`に属するキーなので、次のテーブル宣言より前に置きます。

デスクトップアプリは、個人向けアカウントと対応端末ではMXCを自動的に優先します。したがって、保存済みの`windows.sandbox = "elevated"`だけから、実行方式も`elevated`だとは判断できません。単体CLIではMXC優先は既定で無効です。また、MXCで開始したコマンドの失敗を理由に、従来方式で再実行する設定ではありません。[設定リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference)も参照してください。

### 対応状況を確認する

Codex CLI 0.162.0以降では、PowerShellで対象プロジェクトへ移動し、次のコマンドでMXCによる起動を確認できます。

```powershell
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
$LASTEXITCODE
```

`MXC_OK`が表示され、終了コードが`0`なら、その実行は成功です。保存済みの設定は変更しません。この確認は組み込みの`:workspace`プロファイルと管理設定での起動を対象とし、独自プロファイルやバックグラウンドサーバーまで検証するものではありません。

常にMXCを必須にする場合は、既存の`[windows]`で`sandbox = "mxc"`を指定します。端末が非対応、または管理ポリシーで禁止されていればエラーになります。管理側の`requirements.toml`で`[windows]`に`allow_mxc = false`が指定されている場合は、自動選択と明示指定の両方が禁止されます。

### アクセス範囲と運用上の条件

MXCは実行方式であり、読み書きできる範囲はPermission profileなどで別に定めます。Auto-reviewも別の設定です。実行方式を変えたことだけを理由に、読み取り規則を削除したり、書き込み先を広げたりしません。

MXCでは、実行したコマンドが終了すると残っている子プロセスも停止します。コマンドから開発サーバーを起動して残す運用では、この条件を確認します。ネットワークをプロキシで管理する場合は、実効的な`allow_local_binding = true`が必要です。詳しい通信条件は[公式ガイドの互換性の説明](https://learn.chatgpt.com/docs/windows/windows-sandbox#mxc-compatibility)を参照してください。

## Windowsで`:root`の読み取り権限不足によりタスクを開始できない場合

以下は従来の`elevated`方式に関する診断です。MXCにも同じ制約があるという説明ではありません。

タスクの作成・再開時に`AGENTS.md`の読み込みが失敗し、``elevated Windows sandbox requires effective `:root` read access``と表示された場合は、使用中の権限プロファイルにルートの読み取り権限があるか確認します。

Windowsのelevated sandboxには、ルートの実効的な読み取り権限を起動前に検査する処理があります。使用中のプロファイルが`workspace-with-agents`なら、ユーザー設定の既存テーブルに次の行を追加します。プロファイル名が異なる場合は、その名前に合わせます。

```toml
[permissions.workspace-with-agents.filesystem]
":root" = "read"
```

同じテーブルを重複して追加しないでください。保存後、実行中のタスクが終わってからアプリを通常終了・再起動し、対象タスクを再開します。同じエラーが続く場合は、選択中のプロファイル、上位の設定、ルートへの読み取りを拒否する規則を確認します。検査対象は設定行の有無ではなく、実効的な権限です。

この指定は`AGENTS.md`だけの許可ではなく、ファイルシステム全体の読み取り許可に関わります。書き込み範囲や承認方針は変更しません。このエラーへの対処として、`approval_policy`や`.codex-global-state.json`を変更する必要はありません。

根拠は[PR #44327](https://github.com/openai/codex/pull/44327)です。公開ソースへのマージ日は2026年9月9日ですが、Codexアプリへの収録日や各端末への配信日は、この日付からは判断できません。[Issue #40937](https://github.com/openai/codex/issues/40937)は権限制限による`AGENTS.md`読み込み失敗の関連報告であり、このWindows固有の検査の直接の根拠はPR側です。

### なぜ`AGENTS.md`だけの許可では回避できないか

PR #44327は、現在のWindows elevated sandboxではルートの読み取りを拒否するポリシーを安全に適用できないと説明しています。変更には、起動前の権限検査と、ルートそのものへ読み取り拒否のACLを付けることを防ぐ処理が含まれます。Windows一般の必須条件ではなく、Codexのサンドボックス実装上の制約として扱います。公開PRには、安全に適用できない理由の詳細までは説明されていません。

検査対象は作業ディレクトリが属するファイルシステムのルートです。`"~/.codex/AGENTS.md" = "read"`だけを追加しても、ルートの読み取り権限は付かないため、このエラーを回避できません。`AGENTS.md`がエラーに現れるのは、その読み込みに使うサンドボックスの準備で停止するためです。今回の変更は、ルートを読めない設定を起動前に明示的に拒否するものです。以前その設定で起動できたことだけでは、指定した読み取り制限が正しく強制されていたとは判断できません。

### 読み取り範囲への影響

`:root = "read"`は広い読み取り許可を明示する設定です。機密情報など、読ませたくないファイルがある場合は、必要に応じて個別の保護を検討します。これは設定の意味についての補足であり、PR #44327が特定の保護対象や設定を推奨しているわけではありません。

## Windowsで設定後もGit書き込みが拒否される場合

Windowsでは、設定を有効にしても、以前に付与された拒否ACLが`.git`へ残る場合があります。これは`config.toml`の読み込みとは別の状態です。まず設定が有効であることを確認し、それでも`.git/HEAD.lock: Permission denied`などが発生する場合にACLを調べます。

対象条件と診断・修復手順は、[Windows版CodexでGitの書き込みが拒否される場合の対処](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-windows-git-write-acl-recovery.md)を参照してください。ACL修復は、プロジェクト設定を作るたびに実行する操作ではありません。

## この環境で確認した範囲

2026年9月7日、Windows上のリポジトリで、プロジェクト設定による`.git`の書き込み許可と、残存していた拒否ACLの修復後に動作を確認しました。CodexからGit参照を書き込み、ファイルを含まないコミットを作成して履歴から取り除く操作が成功し、作業ファイルの状態も維持されました。

この結果は、確認時点の環境で書き込みが復旧したことを示します。将来のCodex更新後の動作や、別のPermission profile、旧方式のサンドボックス設定でも同じ結果になることは保証しません。

## 実験的コンテキスト管理と関連Issueの調査メモ

2026年10月25日時点の[設定リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference)では、`features.context_management.experimental_mode`が対象とする機能は現在利用不可とされています。これは通常のコンテキスト管理全体が利用できないという意味ではなく、この実験機能の提供状態です。設定が無視されるかどうかまで、同リファレンスは説明していません。

このノートでは、有効化のための設定例は示しません。利用不可の機能を明示的に無効化するためだけに`experimental_mode = false`を残す必要はないと判断し、関連する調査情報を設定コメントではなく、この節にまとめます。設定の省略は、次の不具合が修正されたことを根拠とするものではありません。

同日に公開Issueの状態、コメント、タイムラインを確認した結果、次の5件はすべてOpenでした。確認した範囲では、これらを解決したと判断できるCodex本体のマージ済み修正PRは見つかりませんでした。

- [#42918](https://github.com/openai/codex/issues/42918)：リマインダー閾値だけの上書きで、モデル由来の引き継ぎ指示やフォールバック設定が失われる報告。設定解決処理の追加分析があります。
- [#42693](https://github.com/openai/codex/issues/42693)：圧縮後に未完了の作業を継続せず停止する報告。重複候補と利用者による改善提案があります。
- [#42449](https://github.com/openai/codex/issues/42449)：必要とされるnotes/historyツールがなく、作業を反復する報告。第三者によるMCPの回避策はありますが、Desktopでの適合性は未検証とされています。
- [#43062](https://github.com/openai/codex/issues/43062)：Windows版Astraで圧縮が長時間停止し、停止操作後にも再発する報告。10月11日にも異なるモデル・ホストから類似報告がありますが、原因の一致は未確認です。
- [#43103](https://github.com/openai/codex/issues/43103)：Astraが途中で終了したり、圧縮・修正・検証を反復したりして作業が完了しない報告。実験機能が原因かどうかは確定していません。

#43062に関連付けられた[T3 CodeのPR #17265](https://github.com/pingdotgg/t3code/pull/17265)は10月20日にマージされています。これはターン終了時に未完了の圧縮項目を処理するT3 Code側の修正であり、Codex本体の圧縮停止を解決した証拠ではありません。

Openであることだけから、最新バージョンのすべての環境で再現するとは判断できません。機能の提供再開が案内された場合、または圧縮後の停止・作業反復が再発した場合に、公式の提供条件、Issueの解決理由、関連PRのマージと利用する製品への収録を改めて確認します。

## 参考資料

- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)：設定ファイルの配置、優先順位、信頼済みプロジェクト。
- [Permissions](https://learn.chatgpt.com/docs/permissions)：Permission profile、設定レイヤー、旧方式との関係、ファイルシステム規則。
- [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)：各設定項目のリファレンス。
