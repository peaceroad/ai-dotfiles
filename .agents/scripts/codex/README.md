# Codex関連スクリプト

2026年8月時点のWindows版Codex環境で確認した問題を対象に、状態確認や既知の問題を安全条件付きで回避・修復するための管理スクリプトです。いずれも、最初に`status`で現在の状態を確認できます。変更を伴う操作では、対象の状態を検証し、対話確認を求めます。

各スクリプトの完全なコマンド一覧と安全条件は、`help`で確認してください。

```samp
node "$HOME/.agents/scripts/codex/<スクリプト名>" help
```

## スクリプト一覧

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

2026年8月22日の確認では、Codexアプリ更新後の共有先に、以前の確認済み版とはSHA-256が異なる未修正版が展開されていました。内容とUTF-8修正後の動作を確認し、次の組み合わせを管理対象へ追加しています。

- 未修正版：`547af3cec2ae71ac2a4ef606365d23a8c58b586862211e9c7a9be7bfd0e30fbb`
- このスクリプトによる修正版：`8467d14095ffec0f1e079fd37c8e5768e0164ee66205ec87c91baaffb49807d8`

これは確認時の共有先の状態を記録するもので、対象ファイルを展開した実行ファイルがCodexアプリ側か単体CLI側かまでは断定しません。確認済みハッシュの全一覧は、管理スクリプト内の`reviewedVariants`を参照してください。

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

まず、読み取り専用の`status`を実行します。

```samp
node "$HOME/.agents/scripts/codex/manage-codex-disk-pressure.mjs" status
node "$HOME/.agents/scripts/codex/manage-skill-validator-utf8-patch.mjs" status
node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" status
```

変更を行う場合は、各スクリプトの`help`を読み、CodexとChatGPTを完全に終了してから対象コマンドを実行してください。必要条件を満たさない場合や、対象が既知の状態と一致しない場合、スクリプトは変更を中止します。

## CodexアプリまたはCLI更新後の確認

CodexアプリまたはCLIを更新した後は、設定が維持されている場合もあれば、対象ファイルやデータベースの状態が変わっている場合もあります。再適用を決める前に、まず3本の`status`を実行し、現在の状態とSQLiteの管理トリガーを確認します。

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

- `manage-codex-disk-pressure.mjs`：Windows、Node.js 18.15以降
- `manage-skill-validator-utf8-patch.mjs`：Node.js 18以降。`apply`による実検証には、PyYAMLを読み込める`python`コマンド
- `manage-sqlite-trace-log-suppression.mjs`：組み込みの`node:sqlite`を利用できるNode.js 22.5以降
