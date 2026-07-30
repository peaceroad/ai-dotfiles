# Codex関連スクリプト

2026年7月時点のWindows版Codex環境で確認した問題を対象に、状態確認や既知の問題を安全条件付きで回避・修復するための管理スクリプトです。いずれも、最初に`status`で現在の状態を確認できます。変更を伴う操作では、対象の状態を検証し、対話確認を求めます。

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
- `status`：対象の`quick_validate.py`が、確認済みの未修正版、管理対象の修正版、UTF-8対応済みの上流版、未知の版のどれに当たるかを確認します。
- `apply`：ファイル全体のSHA-256が確認済みの版と一致する場合だけ、`read_text(encoding="utf-8")`を使う修正を適用します。
- `restore`：ファイル全体がこのスクリプトの生成した修正版と一致する場合だけ、元の記述へ戻します。
- 安全対策：未知の版は変更しません。書き込み前後の完全一致検証、日本語を含む一時スキルでの検証、失敗時のロールバックを行います。

Codexの更新で対象ファイルが置き換わることがあります。更新後は`status`を再実行してください。

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

## 基本的な使い方

まず、読み取り専用の`status`を実行します。

```samp
node "$HOME/.agents/scripts/codex/manage-codex-disk-pressure.mjs" status
node "$HOME/.agents/scripts/codex/manage-skill-validator-utf8-patch.mjs" status
node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" status
```

変更を行う場合は、各スクリプトの`help`を読み、CodexとChatGPTを完全に終了してから対象コマンドを実行してください。必要条件を満たさない場合や、対象が既知の状態と一致しない場合、スクリプトは変更を中止します。

## 実行環境

- `manage-codex-disk-pressure.mjs`：Windows、Node.js 18.15以降
- `manage-skill-validator-utf8-patch.mjs`：Node.js 18以降、PyYAMLを利用できる`python`コマンド
- `manage-sqlite-trace-log-suppression.mjs`：組み込みの`node:sqlite`を利用できるNode.js 22.5以降
