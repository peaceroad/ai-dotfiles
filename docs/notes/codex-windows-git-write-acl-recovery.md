# Windows版CodexでGitの書き込みが拒否される場合の対処

Windows版Codexでファイルは編集できるのに、ブランチ作成などが`.git/HEAD.lock: Permission denied`で失敗する場合があります。Codexの設定で`.git`への書き込みを許可しても、Windows側に書き込み拒否が残っていると解消しません。本ノートでは、設定を確認し、残った拒否を[修復スクリプト](../../tools/agent/codex/manage-git-write-acl.ps1)で調べる手順を説明します。

> **実験的な参考実装です。** 掲載スクリプトで、実際のACL変更、配下全体の検証、修復後のGit書き込みに成功しています。ただし、過去の修復後にはCodexの再起動後に拒否が再付与されたため、再発防止と修復記録からの復元は未検証です。対応条件を満たさない場合は停止します。

## 対象と前提

Windows、PowerShell 7、`git`コマンドと、ローカルのNTFS上にあるリポジトリが必要です。`.git`が通常のフォルダーである構成を対象とします。[`agent`のインストール手順](../agent-development.md#配置とインストール)に従うと、`agent codex git-acl`から利用できます。共通コマンドにはNode.js 24以降も必要です。

`agent`を使わない場合は、[単体スクリプトのガイド](../agent-codex.md)に従い、PowerShell 7から直接実行できます。この場合、Node.jsは不要です。導入先は`~/.agents/ai-dotfiles/runtime/codex/`で、`~`はユーザーのホームフォルダーを表します。

Windowsは、ファイルやフォルダーごとに「誰に何を許可・拒否するか」をアクセス制御リスト（ACL）で管理します。スクリプトは、自分のCodexが作成した`cap_sid`ファイルから、リポジトリのパスに対応するセキュリティ識別子（SID）を取得します。SIDを手入力する必要はありません。

削除対象は、そのSIDに一致し、`.git`自体または配下へ直接設定された、対応する書き込み関連の拒否エントリーです。許可エントリーやほかのSIDの権限を保持し、所有者・グループ・監査の情報は更新対象に含めません。ただし、同じSIDを使うCodexの別セッションにも影響し得ます。また、既知の書き込み拒否には権限情報の読み取りと同期の権限も含まれており、これらを含むエントリー全体を削除します。

次の構成や状態は、自動修復の対象外です。

- `.git`がファイルになっている、リンクされたworktreeやサブモジュール。
- 検査対象のパスにジャンクション、シンボリックリンク、ハードリンクがある場合。ファイルのリンク数を確認できない場合も停止します。
- `.git`より上の親から継承された対象SIDの書き込み拒否や、`.git`上の対応する継承設定を確認できない拒否。`.git`へ直接設定された既知の拒否が配下へ継承された場合は、親の更新に伴って削除される結果を配下全体で検証します。
- ファイル内容の読み取り・実行・権限変更・所有権の取得なども拒否する、未知の書き込み拒否エントリー。
- 対象DACLのエントリー順序が非標準の場合や、削除結果が空のDACLになる場合。

Gitが認識する作業ルートと管理ディレクトリが指定先と異なる場合や、`GIT_DIR`などの環境変数で参照先を変更している場合も停止します。検査から修復完了まで、対象リポジトリを変更するほかの処理を停止してください。同時にファイルやACLが変更される状況には対応しません。

## 復旧手順

### 1. 対象の`.git`への書き込みを許可する

設定の役割と通常のGit運用は、[CodexにGit変更操作を任せる場合の設定](./git-operations.md)で説明しています。ここでは、ACLを調べる前提として必要な設定だけを確認します。

リポジトリの`.codex/config.toml`へ、`.git`の絶対パスと`write`を指定します。以下は、リポジトリが`C:/work/my-project`、使用中の権限プロファイルが`workspace-with-agents`の場合の例です。パスとプロファイル名は、自分の環境に合わせて置き換えてください。

```toml
[permissions.workspace-with-agents.filesystem]
"C:/work/my-project/.git" = "write"
```

権限プロファイルは、許可する範囲をまとめた設定です。`default_permissions`で選択済みのプロファイルへ追加し、既存の`default_permissions`や承認方針は変更しません。同じテーブルが既にある場合は、その中へパスの行だけを追加します。

この例は、権限プロファイルが有効な環境を前提とします。読み込まれる設定に旧方式の`sandbox_mode`がある場合などは、そちらが優先されるため、プロファイルへ追記するだけでは反映されません。また、プロジェクト設定は信頼済みのプロジェクトで読み込まれます。[公式の権限説明](https://learn.chatgpt.com/docs/permissions)と[設定の優先順位](https://learn.chatgpt.com/docs/config-file/config-basic)に沿って、有効な設定を確認してください。

この`write`指定は、`.git`への書き込みを許可するもので、特定のGitコマンドだけを許可する設定ではありません。

あわせて、リポジトリの`.gitignore`へ`/.codex/`を追加します。設定と修復記録をコミット対象から外すための指定です。既に追跡しているファイルは、この指定だけでは追跡解除されません。

### 2. 残っている拒否を確認する

PowerShell 7で次を実行します。実行場所は任意で、`status`の次に自分のリポジトリのパスを渡します。

```powershell
agent codex git-acl status 'C:/work/my-project'
```

`status`は権限を変更せず、検査結果と件数を表示します。

- **`ACL status: clear`**：削除対象の拒否は見つかっていません。手順3は不要なので、手順4へ進みます。
- **`ACL status: matching Codex deny-write entries found`**：直接更新するパス、直接設定された拒否、継承された拒否の件数を確認し、手順3へ進みます。
- **エラーで停止**：修復へ進まず、「解消しない場合」を確認します。途中まで表示された対象だけを見て判断しないでください。

リポジトリは`status -Repo 'パス'`のように引数名を付けても指定できます。SIDの取得元は、環境変数`CODEX_HOME`があればその保存先の`cap_sid`、未設定なら`~/.codex/cap_sid`です。別のCodexホームを使う場合だけ、`-CodexHome 'C:/path/to/codex-home'`を追加します。

### 3. Codexを終了し、外部のPowerShellから修復する

CodexとChatGPT、およびCodexを動かしているCLI／IDEのセッションを終了します。その後、普段のWindowsユーザーとして外部のPowerShell 7を開き、次を実行してください。Codex画面内のターミナルでは実行しません。

```powershell
agent codex git-acl repair 'C:/work/my-project'
```

表示された対象を確認して`y`を入力すると、変更前のDACL（許可・拒否エントリーを保持するACL）を保存してから、対象の拒否エントリーを削除します。それ以外の入力では変更を中止します。

変更直前には、検査した配下全体の状態が変わっていないことを確認します。変更後も、直接更新したパスを含む配下全体のDACL・所有者・グループ・パス構成を予定した結果と照合します。すべて一致すると`Repair result: completed and verified`と、削除・検証した件数を表示します。エラーになった場合は、次の手順へ進まず「修復記録と途中失敗」を確認してください。

### 4. Codexを起動し直して確認する

手順1の設定を有効にしたままCodexを起動し、対象リポジトリを作業ルートにしたタスクを開始します。別のプロジェクトを作業ルートにしたタスクでは、対象リポジトリ内の`.codex/config.toml`はそのタスクのプロジェクト設定として適用されません。

最初に手順2の`status`を再実行します。`ACL status: clear`なら、失敗していたGit操作を再度依頼し、終了コードと実際のブランチなどの状態で成功を確認してください。表示メッセージだけで判断せず、目的の操作が反映されていることを確かめます。読み取りだけの`git status`では、書き込みの成功は確認できません。

再起動後に`ACL status: matching Codex deny-write entries found`へ戻った場合は、再起動後の利用中に拒否が再付与されています。起動時とGit操作時のどちらが契機かを調べる場合は、修復直後、Codexを起動しただけの状態、Git操作後の3時点で`status`を実行します。修復を繰り返しても再発防止にはならないため、有効な権限設定とCodex側の挙動を改めて調べます。

## 修復記録と途中失敗

修復記録の保存先は、リポジトリの`.codex/git-acl-repair-records/<UTC日時>-<短いID>/`です。実行フォルダー名は、たとえば`2026-09-07_013045Z-a1b2c3d4`のようになります。

- `repair-plan.json`：変更前のDACL・所有者・グループ・パス構成と、予定する更新結果。変更を始める前に保存します。
- `verification.json`：更新後に配下全体を再検査した結果。予定と異なる場合も保存後に停止するため、このファイルの存在だけでは成功と判断できません。
- `failure.json`：変更処理の途中で失敗した場合のエラーと、直接更新を試みたパス。継承で影響した配下全体の一覧ではありません。記録自体の保存に失敗した場合は作成されず、元のエラーと修復記録先を端末へ表示します。

途中で失敗した場合は、一部だけ変更されている可能性があります。自動復元機能はないため、再実行する前に保存記録とエラーを確認してください。これらの記録には実際の絶対パスとSIDが含まれるので、そのまま公開しないでください。

## 解消しない場合

- **拒否が再び現れる場合**：削除を繰り返す前に、手順1の設定が実際にCodexへ反映されているかを確認します。
- **`status`が0件なのに書き込めない場合**：このスクリプトで扱う拒否が原因とは確認できていません。Codexの版、有効な権限設定、Gitの終了コードとエラーをそろえて調べます。
- **SIDを取得できない場合や、対象外の状態で停止する場合**：SIDを推測したり停止条件を外したりせず、`cap_sid`の取得元と対象の構成・ACLを個別に調べます。
- **Gitリポジトリの検証で停止する場合**：普段のWindowsユーザーの外部ターミナルで、Gitがそのリポジトリを正常に認識できるかを確認します。

Codexの更新後も、書き込みエラーがなければ無条件に修復を実行する必要はありません。

## 安全対策の根拠と検証範囲

更新用データは、新しいセキュリティ記述子へ`Access`セクションだけを取り込み、対応する拒否を`RemoveAccessRuleSpecific`で削除して作ります。.NETの`SetAccessControl`でDACLだけを保存し、所有者・グループ・監査を更新対象から除外します。[セクションを指定するAPI](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.objectsecurity.setsecuritydescriptorbinaryform?view=net-10.0)、[.NETの保存処理](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.IO.FileSystem.AccessControl/src/System/Security/AccessControl/FileSystemSecurity.cs)、[エントリーを指定した削除](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemsecurity.removeaccessrulespecific?view=net-10.0)

親のDACLの変更は、既存の子へ自動伝播する場合があります。配下の継承された拒否は、同じSIDの対応する継承設定が`.git`へ直接設定されている場合だけ受け入れます。変更前に配下全体の予定結果を作り、変更後のDACL・所有者・グループ・パス構成と照合します。また、空のDACLはアクセスを許可しない状態になるため、その状態を生成する更新を拒否します。[継承可能なACEの自動伝播](https://learn.microsoft.com/en-us/windows/win32/secauthz/automatic-propagation-of-inheritable-aces)、[空のDACLとnull DACL](https://learn.microsoft.com/en-us/windows/win32/secauthz/null-dacls-and-empty-dacls)

ハードリンクは別のパスと同じファイル本体・ACLを共有します。ファイルごとにWindows APIでリンク数を読み取り、1と確認できたファイルだけを対象にします。検査用ハンドルは書き込み権限を要求せず、既存ファイルのメタデータ取得に使います。[ハードリンク](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)、[ファイル情報の取得](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle)、[ファイルを開くAPI](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)

対応する拒否マスクはCodex CLI 0.153.4の実装を基準としています。Windows・PowerShell 7.6.5で、メモリ上のACLを使った対象選択・削除・無関係な権限の保持と、一時リポジトリでの状態確認・停止条件を検証しています。

一般化版の最初の実行では、`.git`上の直接設定4件を削除し、`.git`以下126パスの予定結果との一致を確認しました。直後の`status`は`clear`になりましたが、Codexの再起動後には同じworkspace SIDの直接設定2件と、その継承が再び検出されました。再修復では、直接設定2件と129個の配下パスへ継承された223件を削除し、130パスの予定結果との一致を確認しました。その後の`status`は2回とも`clear`となり、Git参照の更新と、ファイルを含まないコミットの作成・履歴からの取り消しにも成功しました。参照更新の前後では`.git`直下のACLに変化がなく、対象の拒否も再付与されませんでした。**現在の書き込み復旧は確認できましたが、今後の再発防止と修復記録からの復元は未検証です。** 設定による許可後も拒否が再付与された内部原因は特定していません。本スクリプトは、対象に一致する残存拒否を取り除くための実験的な対処です。

## 参考資料

- [Permissions](https://learn.chatgpt.com/docs/permissions)：権限プロファイルとパスごとの許可設定。
- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)：設定の配置と優先順位。
- [Codex CLI 0.153.4の権限処理](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/windows-sandbox-rs/src/allow.rs)と[ACL処理](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/windows-sandbox-rs/src/acl.rs)：保護対象と拒否マスクの実装。
- [`agent codex`と単体スクリプトのガイド](../agent-codex.md)：コマンドと実行環境の一覧。
