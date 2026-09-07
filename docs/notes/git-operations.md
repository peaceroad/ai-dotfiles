# CodexにGit変更操作を任せる場合の設定

通常は`.git`を読み取り専用にし、必要なプロジェクトだけ書き込みを許可します。これにより、`git status`、`git diff`、`git log`などの確認は広く利用しつつ、ブランチ作成、ステージ、コミットなどのGitメタデータ変更を対象リポジトリへ限定できます。

## 承認方針と書き込み権限

`approval_policy`は、Codexがコマンド実行前に承認を求める条件を制御します。`approval_policy = "never"`は承認プロンプトを表示しない設定であり、Gitへの書き込み権限を追加する設定ではありません。

Git操作の可否は、Permission profileのファイルシステム規則で別に決まります。`never`を維持したままGit変更を任せる場合は、対象プロジェクトの`.codex/config.toml`で、使用中のPermission profileへ`.git`の書き込み許可を追加します。許可された操作は承認なしで実行されるため、対象リポジトリと依頼する操作を明確にします。

## プロジェクト単位で`.git`を許可する

次の例は、ユーザー設定で`default_permissions = "workspace-with-agents"`を選択している環境を前提とします。`workspace-with-agents`は利用者が定義したプロファイル名です。

対象リポジトリの`.codex/config.toml`へ次を追加します。

```toml
[permissions.workspace-with-agents.filesystem]
"C:/work/my-project/.git" = "write"
```

パスは対象リポジトリの絶対パスに置き換えます。既存の`approval_policy`と`default_permissions`は変更しません。同じテーブルが既にある場合は、パスの行だけを追加します。

プロジェクト設定は、信頼済みのプロジェクトで、そのリポジトリを作業ルートにした場合に読み込まれます。設定の優先順位では、プロジェクトの`.codex/config.toml`が`~/.codex/config.toml`より上位です。同じPermission profile名の設定は、必要なエントリーだけを上位レイヤーから追加または置換できます。

Permission profileは、旧方式の`sandbox_mode`や`[sandbox_workspace_write]`と併用しません。いずれかの読み込み済み設定やCLI指定で`sandbox_mode`が有効な場合、このPermission profileの追記だけでは反映されません。

絶対パスを含む設定は端末固有なので、`.gitignore`へ次を追加します。

```gitignore
/.codex/
```

既に追跡しているファイルは、この指定だけでは追跡解除されません。

## 反映を確認する

設定後はCodexを再起動するか新しいタスクを開始し、対象リポジトリを作業ルートとして開きます。読み取り専用の`git status`だけで判断せず、必要なGit書き込み操作の終了コードと、ブランチや履歴の実際の状態を確認します。

`.git`の`write`は、特定のGitコマンドだけを許可する設定ではありません。ブランチ作成、ステージ、コミットなど、Codexへ任せる範囲を依頼で指定します。外部リポジトリを変更する`push`は、ローカルの書き込みとは別に扱います。

## Windowsで拒否ACLが残る場合

Windowsでは、設定を有効にしても、以前に付与された拒否ACLが`.git`へ残る場合があります。`.git/HEAD.lock: Permission denied`などが続く場合は、[Windows版CodexでGitの書き込みが拒否される場合の対処](./codex-windows-git-write-acl-recovery.md)に沿って状態を確認します。ACL修復は、書き込みエラーが発生し、対象条件を満たす場合だけ実行します。

## 参考資料

- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Permissions](https://learn.chatgpt.com/docs/permissions)
