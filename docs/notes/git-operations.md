# エージェントによるGit変更操作の扱い

## 現在の方針

エージェントが利用する通常のPermission profileでは、ワークスペース内の`.git`を読み取り専用にします。

```toml
[permissions.workspace-with-agents.filesystem.":workspace_roots"]
"." = "write"
".git" = "read"
```

この設定では、エージェントは`git status`、`git diff`、`git log`などで状態を確認できます。一方、`git add`、`git commit`、ブランチの作成など、Gitメタデータを変更する操作はユーザーが手動で行います。

エージェントは作業完了時に、必要に応じて次の情報を提案します。

- ブランチ名
- ステージ対象のファイル
- コミットメッセージ
- ユーザーが実行するGitコマンド

現時点では、Git変更操作のためだけに権限やスクリプトを追加しません。手動操作の負担が継続的に問題になった場合に、以下の案を再検討します。

## 案1：Git書き込み用のPermission profileを追加する

通常の`workspace-with-agents`とは別に、`.git`への書き込みを許可した`workspace-with-agents-and-git`を用意する案です。Git操作が必要なタスクだけ、Codexの権限メニューからプロファイルを切り替えます。

```toml
[permissions.workspace-with-agents-and-git]
description = "ワークスペース、.git、~/.agentsを編集し、ネットワークアクセスは許可ドメインのみ。"

[permissions.workspace-with-agents-and-git.filesystem.":workspace_roots"]
"." = "write"
".git" = "write"
```

この例は差分を示すための抜粋です。実際に追加する場合は、通常のプロファイルで定義しているファイルシステム規則、`.env`の拒否規則、ネットワーク規則も定義します。

TOMLでは、隣接して複数のテーブルヘッダーを書いても、後続の値を両方のテーブルで共有できません。また、カスタムPermission profile同士の継承は現在の公式ドキュメントで確認できないため、利用する場合は設定の重複を前提とします。

### 利点

- 通常時は`.git`を保護し、必要なタスクだけ権限を切り替えられます。
- 一般的なGit CLIをそのまま利用できます。

### 懸案

- `.git`全体を書き込み可能にするため、許可範囲が広くなります。
- 二つのプロファイルでファイルシステム規則とネットワーク規則を同期する必要があります。
- `approval_policy = "never"`の場合、プロファイル内で許可された操作は確認なしに実行されます。

## 案2：限定的なハンドオフスクリプトを許可する

`.git = "read"`を維持し、`~/.agents/scripts/git-handoff.mjs`のような専用スクリプトだけをCodexのRulesでサンドボックス外実行できるようにする案です。

Rulesの概念例を次に示します。`<absolute-path-to-git-handoff.mjs>`は、実際に利用する環境の絶対パスに置き換えます。

```python
prefix_rule(
    pattern = [
        ["node", "node.exe"],
        "<absolute-path-to-git-handoff.mjs>",
        ["stage", "commit", "create-branch"],
    ],
    decision = "allow",
    justification = "検証済みのスクリプトに限定してGitメタデータの変更を許可する",
)
```

Rulesの`allow`は、該当するコマンドをサンドボックス外で確認なしに実行する指定です。管理者権限への昇格を指定する設定ではなく、実際に利用できる権限はCodexの実行環境とOS側の権限にも左右されます。

ハンドオフスクリプトを実装する場合は、任意のGit引数をそのまま転送しません。少なくとも次を検証します。

- 操作を`stage`、`commit`、`create-branch`などに限定する
- 対象を現在のワークスペースに限定する
- ステージ対象がワークスペース外を指していないことを確認する
- `reset --hard`、`clean`、強制pushなどの破壊的な操作を受け付けない
- `push`はローカルのGit変更操作と分離する

### 利点

- `.git`全体を通常プロファイルで書き込み可能にせず、許可する処理を限定できます。
- 引数と対象リポジトリをスクリプト側でも検証できます。

### 懸案

- スクリプトとRulesを継続的に保守する必要があります。
- 設計を誤ると、スクリプトが任意のGitコマンドを実行する迂回路になります。
- Rulesは実験的な機能であり、今後仕様が変わる可能性があります。

## 再検討する条件

次のような状況になった場合に、自動化を再検討します。

- 手動でのブランチ作成、ステージ、コミットが繰り返し負担になる
- エージェントにコミット単位まで一貫して整理させたい
- 複数のリポジトリで同じ運用が必要になる
- 許可する操作と対象範囲を明確に固定できる

実装する場合は、まず`stage`、`commit`、`create-branch`までを対象にします。外部リポジトリの状態を変更する`push`は別の判断として扱い、初期実装には含めません。

## 参考資料

- [Permissions](https://learn.chatgpt.com/docs/permissions)
- [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules)
