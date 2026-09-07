# Codex関連スクリプト

2026年8〜9月時点のWindows版Codex環境で確認した問題を対象に、状態確認や既知の問題を安全条件付きで回避・修復するための管理スクリプトです。いずれも、最初に`status`で現在の状態を確認できます。変更を伴う操作では、対象の状態を検証し、対話確認を求めます。

各スクリプトの完全なコマンド一覧と安全条件は、`help`で確認してください。

```samp
node "$HOME/.agents/scripts/codex/<スクリプト名>.mjs" help
& "$HOME/.agents/scripts/codex/manage-git-write-acl.ps1" help
```

## スクリプト一覧

### `manage-git-write-acl.ps1`

[スクリプトを表示](./manage-git-write-acl.ps1) · [対象条件と復旧手順](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-windows-git-write-acl-recovery.md)

**実験的な参考実装です。** 一般化した本スクリプトで、実際のACL変更と配下全体の検証に成功し、修復後のGit参照更新と空コミットの作成・取り消しも確認しています。過去の修復後にはCodexの再起動後に拒否が再付与されたため、再発防止と修復記録からの復元は未検証です。

- 用途：Codexの設定で`.git`への書き込みを許可した後も、Windowsの拒否エントリーが残る場合の確認・修復です。
- `status <リポジトリ>`：`cap_sid`のパス対応からSIDを取得し、`.git`自体と配下の拒否エントリーを確認します。
- `repair <リポジトリ>`：変更前のDACLを保存し、対象SIDに一致する、直接設定された書き込み関連の拒否エントリーだけを削除します。
- 安全対策：通常のWindowsユーザーとしての実行、Codex／ChatGPTの終了、対話での`y`入力、修復記録先のGit除外を必須とします。更新対象をDACLに限定し、検査した配下全体のDACL・所有者・グループ・パス構成を変更前後に照合します。
- 対象外：`.git`がファイルのworktreeやサブモジュール、ジャンクションやハードリンクを含む構成、`.git`より上から継承された対象SIDの拒否、ファイル内容の読み取りや実行なども拒否する未知のエントリーです。`.git`へ直接設定された既知の拒否が配下へ継承された場合は、親の更新に伴う削除結果を配下全体で検証します。

Windows、PowerShell 7、`git`と、ローカルのNTFS上にあるリポジトリが必要です。リンク数の検査にはWindows APIを使い、追加ツールは不要です。リポジトリは`-Repo <リポジトリ>`でも指定できます。Codexホームは、`-CodexHome <ディレクトリ>`、環境変数`CODEX_HOME`、`~/.codex`の順に決まります。自分のCodexが作成した`cap_sid`を使ってください。

Gitが認識する作業ルートと管理ディレクトリが指定先と一致することを確認します。`GIT_DIR`などでリポジトリの参照先を変更した環境では停止します。検査から修復完了まで、対象リポジトリを変更するほかの処理も停止してください。同時変更には対応しません。

修復記録は、リポジトリの`.codex/git-acl-repair-records/<UTC日時>-<短いID>/`へ実行ごとに保存します。`/.codex/`をGitから除外し、保存先に追跡済みのファイルがない状態で使います。自動復元機能はないため、途中で失敗した場合は保存記録を確認してください。

所有者・グループ・監査の情報は更新用データに含めません。削除結果が空のDACLになる場合や、対象DACLのエントリー順序が非標準の場合も変更前に停止します。`repair-plan.json`には変更前の状態と予定する結果を、`verification.json`には更新後の検査結果を保存します。`verification.json`の存在だけでは成功とは判断せず、完了メッセージと終了コードを確認してください。

### `manage-codex-disk-pressure.mjs`

[スクリプトを表示](./manage-codex-disk-pressure.mjs)

- 用途：ディスク容量不足によって破損したCodexサンドボックスの`deny_read_acl_state.json`を確認・修復します。
- `status`：空き容量、既知のCodexデータベースのサイズ、`setup_error.json`のメタデータ、`deny_read_acl_state.json`のJSON妥当性を変更せずに確認します。
- `repair`：空または不正な`deny_read_acl_state.json`だけをタイムスタンプ付きバックアップへ移動し、次回起動時にCodexが再生成できる状態にします。
- 正常時の動作：対象ファイルが存在しない場合や、正しいJSONである場合は変更しません。
- 安全対策：5GiB以上の空き容量、CodexとChatGPTの終了、対話での`y`入力を必須とします。破損ファイルは削除も上書きもしません。

このスクリプトはディスクを自動清掃するものではありません。先に十分な空き容量を確保してから、ディスクフル時の書き込み失敗で空になった特定のACL状態ファイルを修復します。データベース、セッション、サンドボックスアカウントなどは変更しません。

### `manage-skill-validator-utf8-patch.mjs`

[スクリプトを表示](./manage-skill-validator-utf8-patch.mjs)

- 用途：Codexの`skill-creator`に含まれるスキル検証処理へ、Windowsで日本語を含む`SKILL.md`をUTF-8として読めるようにする修正を適用・復元します。
- `status`：対象の`quick_validate.py`が、確認済みの未修正版、管理対象の修正版、UTF-8対応の記述を含む未知の版、内容の確認が必要な未知の版のどれに当たるかを確認します。
- `apply`：ファイル全体のSHA-256が確認済みの未修正版のいずれかと一致する場合だけ、`read_text(encoding="utf-8")`を使う修正を適用します。
- `restore`：ファイル全体がこのスクリプトの生成した修正版と一致する場合だけ、元の記述へ戻します。
- 安全対策：未知の版は変更しません。書き込み前後の完全一致検証、日本語を含む一時スキルでの検証、失敗時のロールバックを行います。

この管理スクリプト自体はNode.jsで動作します。`apply`では、修正対象の`~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`を実行して、日本語を含む一時スキルを実際に検証します。`quick_validate.py`が`import yaml`を行うため、この実検証にはPythonとPyYAMLが必要です。管理スクリプトはPythonパッケージを自動インストールしません。

同じターミナルで使われる`python`がPyYAMLを読み込めるか、次のコマンドで確認できます。

```samp
python -c "import yaml; print(yaml.__version__)"
```

読み込めない場合は、使用するPython環境を選択または有効化してから、PyYAMLを手動でインストールします。

```samp
python -m pip install PyYAML
```

対象は、既定のCodexホームに展開されたシステムスキルのファイルです。Codexアプリと単体のCodex CLIは別の実行ファイルやバージョンで動作する場合がありますが、`CODEX_HOME`を変更していなければ、どちらも既定の`~/.codex`を使用します。対象ファイルがCodexの更新などで置き換わることがあるため、アプリまたはCLIの更新後は`status`を再実行してください。

確認済みハッシュの更新履歴は次のとおりです。

| 確認日 | 未修正版 | 修正版 |
| --- | --- | --- |
| 2026-08-22 | `547af3cec2ae71ac2a4ef606365d23a8c58b586862211e9c7a9be7bfd0e30fbb` | `8467d14095ffec0f1e079fd37c8e5768e0164ee66205ec87c91baaffb49807d8` |
| 2026-09-05 | `6068513d924ed3559e186dfcdead7439129828dcf402167fd925c06dffbf2806` | `60d7a11365c2f3f1ec22e57f749c18aaa50177e62f9e284de2f03fa46e3c2ce7` |

全一覧は、管理スクリプト内の`reviewedVariants`を参照してください。

### `manage-sqlite-trace-log-suppression.mjs`

[スクリプトを表示](./manage-sqlite-trace-log-suppression.mjs)

- 用途：CodexのSQLite診断ログ`logs_2.sqlite`へ今後保持する最小ログレベルを設定し、不要な低レベルログの蓄積を抑えます。
- `status`：データベース構造、管理対象トリガー、ファイルサイズ、記録されているログレベル、最近のTRACEログを変更せずに確認します。
- `suppress`：`trace`、`debug`、`info`、`warn`、`error`、`none`から保持方針を選びます。レベルを省略した対話形式では、Enterキーで`info`を選択します。
- `restore`：管理対象トリガーを削除し、すべてのログレベルを再び保持します。
- 安全対策：既存行は削除せず、データベースの新規作成、`VACUUM`、WAL／SHMファイルの削除を行いません。構造が想定外の場合は変更を中止します。

保持方針は次のとおりです。

- `trace`：標準ログレベルをすべて保持します。
- `debug`：TRACEを抑制します。
- `info`：TRACEとDEBUGを抑制します。通常の診断情報とログ量のバランスを取りやすい設定です。
- `warn`：TRACE、DEBUG、INFOを抑制します。普段ログをほとんど使わず、警告とエラーは残したい場合に向きます。
- `error`：標準ログレベルではERRORだけを保持します。
- `none`：ERRORや未知のレベルを含め、`logs`テーブルへ追加される今後の行をすべて破棄します。

`none`は既存行を削除せず、データベースのファイルサイズも縮小しません。`logs_2.sqlite`やWAL／SHMファイルは、その後も開かれたり更新されたりする可能性があります。また、Codexのほかの診断情報やテレメトリまで無効にする設定ではありません。

`status`でDEBUG、INFO、TRACEなどの既存行が表示されても、設定前に記録された行が残っている可能性があります。抑制設定は今後のINSERTに作用するもので、既存行の表示だけでは現在のトリガーが無効だとは判断できません。

## 基本的な使い方

まず、読み取り専用の`status`を実行します。Gitの権限を調べる場合は、対象リポジトリを指定してください。

```samp
& "$HOME/.agents/scripts/codex/manage-git-write-acl.ps1" status 'C:/work/my-project'
node "$HOME/.agents/scripts/codex/manage-codex-disk-pressure.mjs" status
node "$HOME/.agents/scripts/codex/manage-skill-validator-utf8-patch.mjs" status
node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" status
```

変更を行う場合は、各スクリプトの`help`を読み、CodexとChatGPTを完全に終了してから対象コマンドを実行してください。必要条件を満たさない場合や、対象が既知の状態と一致しない場合、スクリプトは変更を中止します。

## CodexアプリまたはCLI更新後の確認

CodexアプリまたはCLIを更新した後は、設定が維持されている場合もあれば、対象ファイルやデータベースの状態が変わっている場合もあります。再適用を決める前に、上記のNode.jsスクリプト3本の`status`で、現在の状態とSQLiteの管理トリガーを確認します。GitのACLスクリプトは、書き込みエラーが起きた場合に対象リポジトリを指定して使います。

- `skill-creator`の`status`が「exact local UTF-8 patch」なら、修正はそのまま有効です。「reviewed unpatched version」の場合は安全条件を確認して`apply`を検討します。「unknown version with an explicit UTF-8 fix」または「unknown version requiring review」の場合は手動パッチを適用せず、内容の確認を優先します。
- SQLiteの`status`が管理対象ポリシーを`active`と報告するなら、ログ保持設定はすでに有効です。設定を同じレベルへ戻すためだけに`suppress`を再実行する必要はありません。

更新版Codexのログ挙動を再確認したい場合は、SQLiteの抑制がTRACEの発生を隠すため、次の手順で通常ログを観測します。

1. ChatGPT／Codexを完全に終了し、SQLiteスクリプトの`restore`を実行する。
2. 更新後のCodexを起動し、通常のセッションを1回実行する。
3. Codexを終了してからSQLiteスクリプトの`status`を実行する。
4. ログがまだ過剰なら、必要な保持レベルで`suppress`を再実行する。問題が解消していれば、復元した状態を維持する。

この確認手順で既存ログを削除することはありません。`restore`は管理対象トリガーを外すだけで、データベースの既存行を消去しません。

1回のセッションだけで本体側の修正を証明できるわけではありませんが、更新後に抑制設定を再適用するか判断する材料になります。

## 実行環境

- `manage-git-write-acl.ps1`：Windows、PowerShell 7、`git`、ローカルのNTFS上にあるリポジトリ
- `manage-codex-disk-pressure.mjs`：Windows、Node.js 18.15以降
- `manage-skill-validator-utf8-patch.mjs`：Node.js 18以降。`apply`による実検証には、PyYAMLを読み込める`python`コマンド
- `manage-sqlite-trace-log-suppression.mjs`：組み込みの`node:sqlite`を利用できるNode.js 22.5以降
