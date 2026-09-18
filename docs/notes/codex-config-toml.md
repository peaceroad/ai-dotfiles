# Codexの`config.toml`をユーザー設定とプロジェクト設定に分ける

Codexの設定は、全体で共通する既定値を`~/.codex/config.toml`へ置き、特定のリポジトリやサブフォルダーだけで必要な差分を`.codex/config.toml`へ置けます。承認方針を全体で維持しながら、モデルやファイルシステム権限などをプロジェクト単位で変えたい場合に、この設定レイヤーを使います。

このノートでは、設定の読み込み順と役割を説明し、具体例として`approval_policy = "never"`を維持したまま、特定のプロジェクトでCodexにGit変更操作を任せる設定を示します。

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

Permission profileはベータ機能です。`default_permissions`と`[permissions]`を使う方式は、旧方式の`sandbox_mode`や`[sandbox_workspace_write]`と併用しません。読み込まれる設定やCLI指定に`sandbox_mode`がある場合、Codexは旧方式を使用します。

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

## Windowsで`:root`の読み取り権限不足によりタスクを開始できない場合

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

## 参考資料

- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)：設定ファイルの配置、優先順位、信頼済みプロジェクト。
- [Permissions](https://learn.chatgpt.com/docs/permissions)：Permission profile、設定レイヤー、旧方式との関係、ファイルシステム規則。
- [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)：各設定項目のリファレンス。
