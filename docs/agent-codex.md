# `agent codex`と単体スクリプトで状態を確認する

Codexの状態確認、既知の問題の回避・修復、保存済みセッションの整理に使う管理スクリプトです。最初に`status`、セッションの整理では`list`と`plan`で状態を確認します。変更を伴う操作では、対象の状態を検証し、対話確認を求めます。実機確認は2026年8〜9月のWindows環境で行っています。

## 共通コマンドと単体実行

[`agent`のインストーラー](./agent-development.md#配置とインストール)で、共通コマンドと各スクリプトを一緒に導入します。正本は`tools/agent/codex/`、導入先は`~/.agents/ai-dotfiles/runtime/codex/`です。旧`~/.agents/scripts/codex/`からの自動移行や、そこへの互換コピーは行いません。

```powershell
agent codex
agent codex --help
```

対話端末で`agent codex`だけを実行すると、用途の説明付きメニューが開きます。ツールを選ぶと、必要条件と操作一覧を表示します。操作は番号・短縮キー・名前で選べ、`h`で詳細ヘルプ、`b`で戻る、`q`で終了できます。入力・出力をリダイレクトした場合は、メニューの代わりにヘルプだけを表示します。

メニューと通常ヘルプには、Windowsでは5項目すべて、macOS／Linuxでは`log-policy`と`session`を表示します。ただし、通常表示から外すことと、実行を禁止することは区別しています。

- `git-acl`と`disk-pressure`はWindows専用です。他のOSで操作を直接指定しても、入力を求めたり子プロセスを起動したりせず停止します。個別の`help`は概要と必要条件だけを表示します。
- `skill-validator-utf8`は、Pythonの既定文字コードがUTF-8である環境では通常不要なため、macOS／Linuxの通常表示から外しています。必要な場合は、`agent codex skill-validator-utf8`で専用メニューを開くか、操作を直接指定できます。単体スクリプトもOSで制限しません。
- `log-policy`はOS固有APIに依存しませんが、macOS／Linuxでは実機未検証です。その旨を表示し、既存のDB・スキーマ・変更確認の検査は維持します。
- `session`の`list`・`plan`・`export`は全OSで利用できますが、macOS／Linuxでは実機未検証です。`archive`と`delete`はWindowsに限定しています。

メニューを使わず、操作を直接指定することもできます。次はWindowsでの状態確認例です。

```powershell
agent codex git-acl status 'C:/work/my-project'
agent codex disk-pressure status
agent codex skill-validator-utf8 status
agent codex log-policy status
agent codex session list
```

`agent codex log-policy`のようにツール名まで指定すると、そのツールのメニューから始められます。Git権限のメニューでは対象リポジトリのパスを求め、Enterだけなら操作を取り消します。ログの`suppress`は子スクリプト自身が保持レベルの選択と変更確認を行います。メニューの選択だけで、スクリプト側の安全確認を省略することはありません。表示・エラーは英語です。

これはai-dotfilesが提供する補助コマンドであり、Codex公式CLIのサブコマンドではありません。`development.json`は不要です。`agent`の入口はNode.js 24以降を必要とします。Windows専用ツールはWindows以外では操作を開始せず、各ツールの追加要件は後述します。

各ファイルは`agent`に依存せず、Node.js／PowerShellから直接実行できます。リポジトリのルートから使う場合は次のとおりです。

```powershell
node tools/agent/codex/codex.mjs
node tools/agent/codex/manage-codex-disk-pressure.mjs help
node tools/agent/codex/manage-skill-validator-utf8-patch.mjs help
node tools/agent/codex/manage-sqlite-trace-log-suppression.mjs help
node tools/agent/codex/manage-codex-sessions.mjs help
pwsh -NoProfile -File tools/agent/codex/manage-git-write-acl.ps1 help
```

単体スクリプトには同じディレクトリのほかのファイルへの依存はありません。単体実行の必要バージョンは「実行環境」を参照してください。インストール済みコピーの完全なコマンド一覧と安全条件も、`help`で確認できます。

```samp
node "$HOME/.agents/ai-dotfiles/runtime/codex/<スクリプト名>.mjs" help
& "$HOME/.agents/ai-dotfiles/runtime/codex/manage-git-write-acl.ps1" help
```

## スクリプト一覧

### `manage-codex-sessions.mjs`

共通コマンド：`agent codex session`

[スクリプトを表示](../tools/agent/codex/manage-codex-sessions.mjs) · [期間指定・保護処理・エクスポートの設計ノート](notes/codex-session-management.md)

**実験的な機能です。アーカイブ・削除は架空のデータと公式コマンドの代替処理で検証し、エクスポートも試験用データで検証しています。実際の利用者の履歴に対する変更操作は未検証です。** Node.js 24以降と、対応する`state_5.sqlite`の保存形式が必要です。`CODEX_HOME`が指定されていればその場所、未指定なら`~/.codex`を参照します。SQLiteの保存先を個別に変更した構成には対応しません。

まず、保存済みセッションを容量の大きい順に確認します。次は、`agent`のインストール後に端末から実行する例です。

```powershell
agent codex session list
agent codex session list --before 2026-07-01 --limit 0
agent codex session list --before 4w --limit 0
agent codex session plan delete --before 4w
agent codex session plan archive --before 2026-07-01
agent codex session plan export --before 2026-07-01
```

`list`はUUID・更新日・計測できた履歴ファイルのサイズ・タイトル・保護理由を表示します。通常は最大20件、`--limit 0`なら条件に一致する全件です。`--before`は指定日のUTC午前0時より前に更新されたセッションを抽出します。更新日は最後に閲覧した日ではありません。サイズ不明の件数は`size unknown`として区別し、合計へ含めません。共有データベース・添付ファイル・索引にない履歴も集計対象外なので、表示値はCodex全体の使用量や削除後に空く容量ではありません。タイトルには個人情報が含まれる可能性があるため、出力を共有する前に確認してください。

`--before 4w`は、コマンドを起動した時刻の28日前よりも前に更新されたセッションを選びます。`--before 4weeks`、`--before 4 weeks`、`--before "4 weeks"`も同じ意味です。週数は正の整数だけを受け付け、誤字や単位の省略はエラーにします。既存の`--older-than-weeks 4`も互換用に残しています。処理中に基準時刻は動かしません。年月日・週数・UUIDは同時指定せず、いずれか1つで選びます。`plan`の操作名を省略すると削除計画になります。

期間指定では、該当セッションとその子孫をグループにまとめ、重複する子孫を除きます。子孫に基準日時以降のセッションが含まれるグループは、親も含めて除外し、`Skipped family`で理由を表示します。アーカイブ・削除では保護対象を含むグループも除外します。除外されなかったグループだけが一括処理の対象です。アーカイブ済みのセッションは、期間指定によるアーカイブの起点から除きます。

`plan <UUID>`のように個別指定することもできます。メニューから操作を選び、対象を省略した場合は、UUID・`2026-07-01`のような年月日・`4w`のような週数を入力します。Enterだけなら取り消します。`list`と`plan`は索引とファイル属性を読み取るだけで、新しいCodexサーバーを起動せず、履歴本文も読みません。計画ファイルや独自の管理データは作成しません。

アーカイブ・削除を実行する前に、表示された親子セッションがすべて対象でよいことを確認してください。**削除後の復元機能はありません。アーカイブは同じCodexホーム内へ履歴を移す操作なので、履歴ファイル分の容量は減りません。** どちらもWindows、PowerShell 7、Codex CLI 0.153.4が必要です。Codex／ChatGPTのアプリ、CLI、IDE連携、自動実行などを終了し、処理が完了するまで再起動しないでください。共有ストレージへの別PCからの書き込みや、検査と同時に開始する処理には対応しません。

履歴のアーカイブとは別に、アプリには関連する管理対象worktreeを自動整理する仕組みがあります。必要な作業内容は、アーカイブ前に通常の作業場所などへ保全してください。このスクリプトはworktreeを直接削除しませんが、アプリ側の整理や復元を代行・保証するものではありません。[公式のworktree整理仕様](https://learn.chatgpt.com/docs/environments/git-worktrees#worktree-cleanup)

```powershell
agent codex session archive --before 4w
agent codex session delete --before 2026-07-01
```

変更計画では、ピン留め・サイドバーのセクション所属・未完了の目標・自動実行や受信箱との関連・アプリの実行待ち情報を確認します。UUIDの個別指定で保護理由があれば、その操作を停止します。保存形式や権限の問題で保護情報を確認できない場合は、一括処理全体を止めます。リンクされた履歴ファイルや通常の保存範囲外のファイルも変更対象外です。

確認画面に表示された文字列を正確に入力した後、クライアントの終了状態と、対象の親子関係・更新日時・ファイル属性・保護理由を再検査します。個別指定では`DELETE <UUID>`など、一括処理では操作名・件数・計画の短い識別子を入力します。変更がなければ、重複を除いた各グループの起点に対して、公式の`codex archive`または`codex delete`を1回ずつ呼び出します。この補助コマンドでは確認を省く`--force`や`--yes`を受け付けません。削除時だけ、表示・確認・再検査した対象に限って公式CLIの`--force`を使います。

各グループについて、削除後は索引と履歴ファイルから対象が消えたこと、アーカイブ後は子孫も含めてアーカイブ先へ移ったことを確認します。残りのグループも処理直前に再検査します。途中失敗や確認不能の場合は、確認済みの起点UUIDと、一部が既に変更されている可能性を報告して停止します。一括処理全体を巻き戻す機能や自動再試行はありません。再実行の前に`list`で残っている対象を確認してください。作業ディレクトリや成果物の削除、データベースの直接編集・圧縮は行いません。

保存用エクスポートは、アーカイブ・削除とは別の操作です。次は、既に存在する外付けドライブ上の`E:/CodexExports`へ、指定日より前の履歴を書き出す例です。保存先は自分の環境に合わせて置き換え、十分な空き容量を用意してください。

```powershell
agent codex session export --before 2026-07-01 --output 'E:/CodexExports'
```

確認後、保存先に`codex-sessions-<UTC日時>-<識別子>/`を新規作成します。元の履歴はアーカイブも削除もしません。毎回別のフォルダーを作り、既存のエクスポートを上書きしません。Codexホーム内とGitリポジトリ内への出力は拒否します。開始前に計測済みの生ログ容量と64MiBの余裕があるか確認しますが、関連履歴データの分はさらに必要なので、この検査だけでは最後まで容量が足りることを保証しません。

- `manifest.json`：タイトル・UUID・更新時刻・親子関係・保存ファイル名・SHA-256を記録します。`complete: true`のmanifestがある場合だけ完了済みです。
- `<更新日>_<UUID>.jsonl`：元の履歴ファイルを保存します。
- `<UUID>.history.jsonl`：対応する履歴DBがある場合、選択したセッションの保存済みターン・項目・リアルタイム項目・生ログとの対応位置を、元のテーブル名付きで保存します。無関係なセッションのDB行は含めません。
- `README.txt`：保存内容と制限を記載します。

コピーと履歴データのハッシュを検証し、最後に元セッションの状態を再検査します。履歴DBは読み取り専用のトランザクションで参照し、処理中の別接続からのコミットやDBの新規出現も検知します。途中失敗や検知した変更があれば、完了manifestを作らず、不完全な出力フォルダーの場所を報告します。調査のため途中ファイルを残し、自動削除・自動再試行はしません。複数DBと履歴ファイルを一括で固定する仕組みではないため、エクスポート時もCodexなどの書き込み元を終了し、処理中は再起動しないことを推奨します。並行更新下での完全な整合性は保証しません。

エクスポートは元データを変更しないため、ピン留めなどの保護対象も含めて保存できます。ただし、読み取れないファイルや対象期間外の子孫があるグループは除外します。ページ分割された履歴に必要なDBがない場合や、保存形式が未対応の場合は停止します。**履歴には個人情報や機密情報が含まれ得ます。** 出力は公開用ではなく、ローカルでの閲覧・保全用です。添付ファイル・作業ディレクトリ・参照先ファイルの収集やCodexへの再取り込みは行わないため、セッションを元どおり再開できるバックアップではありません。

親子を含む削除範囲は[公式のセッション削除仕様](https://learn.chatgpt.com/docs/app-server#delete-a-thread)に基づきます。読み取り側はCodexの内部保存形式に依存するため、将来の更新で利用できなくなる可能性があります。公式CLIのバージョンが異なる場合は削除を停止し、対応確認を促します。

### `manage-git-write-acl.ps1`

共通コマンド：`agent codex git-acl`

[スクリプトを表示](../tools/agent/codex/manage-git-write-acl.ps1) · [対象条件と復旧手順](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-windows-git-write-acl-recovery.md)

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

共通コマンド：`agent codex disk-pressure`

[スクリプトを表示](../tools/agent/codex/manage-codex-disk-pressure.mjs)

- 用途：ディスク容量不足によって破損したCodexサンドボックスの`deny_read_acl_state.json`を確認・修復します。
- `status`：空き容量、既知のCodexデータベースのサイズ、`setup_error.json`のメタデータ、`deny_read_acl_state.json`のJSON妥当性を変更せずに確認します。
- `repair`：空または不正な`deny_read_acl_state.json`だけをタイムスタンプ付きバックアップへ移動し、次回起動時にCodexが再生成できる状態にします。
- 正常時の動作：対象ファイルが存在しない場合や、正しいJSONである場合は変更しません。
- 安全対策：5GiB以上の空き容量、CodexとChatGPTの終了、対話での`y`入力を必須とします。破損ファイルは削除も上書きもしません。

このスクリプトはディスクを自動清掃するものではありません。先に十分な空き容量を確保してから、ディスクフル時の書き込み失敗で空になった特定のACL状態ファイルを修復します。データベース、セッション、サンドボックスアカウントなどは変更しません。

### `manage-skill-validator-utf8-patch.mjs`

共通コマンド：`agent codex skill-validator-utf8`（全OSで直接指定可能）

[スクリプトを表示](../tools/agent/codex/manage-skill-validator-utf8-patch.mjs)

- 用途：Codexの`skill-creator`に含まれるスキル検証処理へ、`SKILL.md`を環境の既定文字コードではなくUTF-8として読む修正を適用・復元します。
- `status`：対象の`quick_validate.py`が、確認済みの未修正版、管理対象の修正版、UTF-8対応の記述を含む未知の版、内容の確認が必要な未知の版のどれに当たるかを確認します。
- `apply`：ファイル全体のSHA-256が確認済みの未修正版のいずれかと一致する場合だけ、`read_text(encoding="utf-8")`を使う修正を適用します。
- `restore`：ファイル全体がこのスクリプトの生成した修正版と一致する場合だけ、元の記述へ戻します。
- 安全対策：未知の版は変更しません。書き込み前後の完全一致検証、日本語を含む一時スキルでの検証、失敗時のロールバックを行います。

問題になるのは、検証処理の`skill_md.read_text()`が、UTF-8のファイルをcp932など別の文字コードとして読む場合です。日本語のスキル自体が不正なのではなく、読み取り時にエラーや文字化けが起きる問題です。Pythonの既定文字コードがUTF-8なら通常この修正は不要で、OS名だけでは必要性を判断できません。文字コード省略時の扱いは[Pythonのテキストエンコーディングの説明](https://docs.python.org/3/library/io.html#text-encoding)を参照してください。

`status`は検証スクリプトの内容を判定するもので、実行時のPython環境を診断するものではありません。確認済みの未修正版であっても、自分の環境でUTF-8の読み取りに問題がなければ、予防的に`apply`する必要はありません。

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

共通コマンド：`agent codex log-policy`

[スクリプトを表示](../tools/agent/codex/manage-sqlite-trace-log-suppression.mjs)

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

まず、読み取り専用の`status`、セッションの整理では`list`を実行します。Gitの権限を調べる場合は、対象リポジトリを指定してください。

```samp
& "$HOME/.agents/ai-dotfiles/runtime/codex/manage-git-write-acl.ps1" status 'C:/work/my-project'
node "$HOME/.agents/ai-dotfiles/runtime/codex/manage-codex-disk-pressure.mjs" status
node "$HOME/.agents/ai-dotfiles/runtime/codex/manage-skill-validator-utf8-patch.mjs" status
node "$HOME/.agents/ai-dotfiles/runtime/codex/manage-sqlite-trace-log-suppression.mjs" status
node "$HOME/.agents/ai-dotfiles/runtime/codex/manage-codex-sessions.mjs" list
```

変更を行う場合は、各スクリプトの`help`を読み、CodexとChatGPTを完全に終了してから対象コマンドを実行してください。必要条件を満たさない場合や、対象が既知の状態と一致しない場合、スクリプトは変更を中止します。

## CodexアプリまたはCLI更新後の確認

CodexアプリまたはCLIを更新した後は、設定が維持されている場合もあれば、対象ファイルやデータベースの状態が変わっている場合もあります。利用しているパッチやログ保持設定について、再適用を決める前に対応する`status`で確認します。`git-acl`はGitの書き込みエラーが起きた場合に、`disk-pressure`はWindowsのディスク容量不足やACL状態ファイルの破損が疑われる場合に使います。

- `agent codex skill-validator-utf8 status`が「exact local UTF-8 patch」なら、修正はそのまま有効です。「reviewed unpatched version」の場合は、自分のPython環境でUTF-8の読み取りに問題があるときだけ、安全条件を確認して`apply`を検討します。「unknown version with an explicit UTF-8 fix」または「unknown version requiring review」の場合は手動パッチを適用せず、内容の確認を優先します。
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
- `manage-codex-sessions.mjs`：Node.js 24以降。`archive`と`delete`にはWindows、PowerShell 7、Codex CLI 0.153.4も必要
