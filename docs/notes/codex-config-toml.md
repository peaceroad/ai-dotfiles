# Codexの`config.toml`をユーザー設定とプロジェクト設定に分ける

Codexの設定は、全体で共通する既定値を`~/.codex/config.toml`へ置き、特定のリポジトリやサブフォルダーだけで必要な差分を`.codex/config.toml`へ置けます。承認方針を全体で維持しながら、モデルやファイルシステム権限などをプロジェクト単位で変えたい場合に、この設定レイヤーを使います。

このノートでは、設定の読み込み順と役割を説明し、具体例として`approval_policy = "never"`を維持したまま、特定のプロジェクトでCodexにGit変更操作を任せる設定を示します。

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
