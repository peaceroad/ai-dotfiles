# `agent codex`と単体スクリプトで状態を確認する

Codexの状態確認、既知の問題の回避・修復、保存済みセッションの整理に使う管理スクリプトです。最初に`status`、セッションの整理では`list`と`plan`で状態を確認します。変更を伴う操作では対象の状態を検証し、対話で確認します。`session`は確認済みの計画を指定するオプションにも対応しています。実機確認の範囲は各項目に記載しています。

## 共通コマンドと単体実行

[`agent`のインストーラー](./agent-development.md#配置とインストール)で、共通コマンドと各スクリプトを一緒に導入します。正本は`tools/agent/codex/`、導入先は`~/.agents/ai-dotfiles/runtime/codex/`です。旧`~/.agents/scripts/codex/`からの自動移行や、そこへの互換コピーは行いません。

```powershell
agent codex
agent codex --help
```

対話端末で`agent codex`だけを実行すると、用途の説明付きメニューが開きます。ツールを選ぶと、必要条件と操作一覧を表示します。操作は番号・短縮キー・名前で選べ、`h`で詳細ヘルプ、`b`で戻る、`q`で終了できます。入力・出力をリダイレクトした場合は、メニューの代わりにヘルプだけを表示します。

メニューと通常ヘルプには、Windowsではすべての項目、macOS／Linuxでは`log-policy`・`session`・`history`・`permission`を表示します。ただし、通常表示から外すことと、実行を禁止することは区別しています。

- `git-acl`、`disk-pressure`、`marketplace-staging`、`app`はWindows専用です。他のOSで操作を直接指定しても、入力を求めたり子プロセスを起動したりせず停止します。個別の`help`は概要と必要条件だけを表示します。
- `skill-validator-utf8`は、Pythonの既定文字コードがUTF-8である環境では通常不要なため、macOS／Linuxの通常表示から外しています。必要な場合は、`agent codex skill-validator-utf8`で専用メニューを開くか、操作を直接指定できます。単体スクリプトもOSで制限しません。
- `log-policy`はOS固有APIに依存しませんが、macOS／Linuxでは実機未検証です。その旨を表示し、既存のDB・スキーマ・変更確認の検査は維持します。
- `session`の`list`・`plan`・`export`は全OSで利用できますが、macOS／Linuxでは実機未検証です。`archive`と`delete`はWindowsに限定しています。

メニューを使わず、操作を直接指定することもできます。次はWindowsでの状態確認例です。

```powershell
agent codex git-acl status 'C:/work/my-project'
agent codex disk-pressure status
agent codex marketplace-staging status
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
node tools/agent/codex/manage-codex-history.mjs help
pwsh -NoProfile -File tools/agent/codex/manage-git-write-acl.ps1 help
```

`session`と`history`は隣接する`session-export-*.mjs`と`session-lineage.mjs`・`session-rollout-io.mjs`等の共通処理を使うため、ファイルを持ち出す場合はこれらも一緒に置いてください。`agent`コマンド自体への依存はありません。単体実行の必要バージョンは「実行環境」を参照してください。インストール済みコピーの完全なコマンド一覧と安全条件も、`help`で確認できます。

```samp
node "$HOME/.agents/ai-dotfiles/runtime/codex/<スクリプト名>.mjs" help
& "$HOME/.agents/ai-dotfiles/runtime/codex/manage-git-write-acl.ps1" help
```

## スクリプト一覧

### `manage-codex-scrollbar.mjs`

共通コマンド：`agent codex app`（`scrollbar`も互換エイリアス）。Windows専用で、Node.js 24以降が必要です。引数なしでは対話メニューを開き、起動や`codexapp`の登録を選べます。リダイレクト時はヘルプだけを表示します。

Codexを完全に終了してから、外部のPowerShellで次を実行します。

```powershell
agent codex app launch
```

`launch`は、細いスクロールバーをつかみやすくするため、標準の幅と色でCodexを起動します。24pxなどの幅指定はできません。Codexの公式設定ではないため、アプリの更新によって効かなくなる場合があります。起動後にサイドバーと会話欄の表示を確認してください。ほかの領域のスクロールバーにも影響する場合があります。元に戻すには、Codexを終了してスタートメニューから通常起動します。

内部では、起動引数`--enable-blink-features=PreferDefaultScrollbarStyles`と`--blink-settings=prefersDefaultScrollbarStyles=true`を渡します。[Chromiumのテスト設定](https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/web_tests/VirtualTestSuites#L2485-L2509)に同じ組み合わせがあります。アプリ本体や保存設定は書き換えず、デバッグ接続も有効にしません。

起動にはWindowsの[パッケージ起動API](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationactivationmanager-activateapplication)を使います。実行ファイルの直接起動では、必要なパッケージIDが付かず起動に失敗する場合があるためです。補助スクリプト`launch-codex-app.ps1`はWindows PowerShellで動作します。`Opening Codex with wider scrollbars.`は、Windowsが起動要求を受け付けた時点で表示します。画面が開かない場合は、スタートメニューから通常起動できるか確認してください。

短い起動コマンド`codexapp`は、`agent codex app profile`で登録できます。PowerShell 7のコンソール用ユーザープロファイルが対象です。登録先と追加内容を表示し、対話端末で確認した場合だけ追記します。既存ファイルは隣にバックアップし、登録済みなら追記しません。同名コマンドや変更済みの登録ブロックを検出した場合は上書きせず停止します。別ファイルで定義されたコマンドは読み込み時にも確認し、既存の定義を優先します。非対話実行では表示だけで終わります。

登録後は新しいPowerShell 7のコンソールで`codexapp`を実行します。現在のコンソールで使う場合は、プロンプトに直接`. $PROFILE`を入力してください。関数はデバッグなしの`launch`を呼び、幅やポートの指定は受け付けません。解除する場合は、プロファイル内の`# >>> ai-dotfiles codexapp >>>`から対応する終了マーカーまでを削除します。

ピクセル幅を指定する従来の方式は、明示的な実験用操作として残しています。

```powershell
agent codex app debug-launch --width 24
agent codex app apply --width 24
agent codex app remove
```

`debug-launch`はローカルのデバッグ接続を有効にして起動し、一時的なCSSを挿入します。幅の既定値は24pxです。`apply`と`remove`はデバッグ接続があるアプリ専用で、通常起動への後付け適用はできません。`remove`はCSSだけを解除します。接続口が開いている間はほかのローカルプロセスもアプリを操作できるため、使用後はCodexを終了して通常起動し直してください。成功表示はCSSの挿入確認で、表示幅の検証ではありません。再読み込みや追加ウィンドウでは再適用が必要になる場合があります。常駐監視は行いません。

関連する要望：[Custom scrollbar width / DevTools access in Codex Desktop #36270](https://github.com/openai/codex/discussions/36270)。公式の対応予定を示すものではありません。

### `manage-codex-permissions.mjs`

共通コマンド：`agent codex permission`（`permissions`も互換エイリアス）

[スクリプトを表示](../tools/agent/codex/manage-codex-permissions.mjs) · [承認設定の確認と対処ノート](notes/codex-desktop-permission-diagnostics.md)

`status`は、設定ファイル・アプリ保存値・指定タスクの実行記録を読み取り専用で比較します。対話端末で`agent codex permission status`を実行すると、最近のタスクを最大12件、プロジェクト名とタイトル付きで選べます。Node.js 24以降とPython 3.11以降が必要です。単体で持ち出す場合は、隣接する`inspect-codex-permissions.py`も一緒に置いてください。

設定変更や自動修復は行いません。現在の診断レポートは、実行中のアプリの条件などに未取得項目が残るため終了コード`3`を返します。不一致や終了コードだけで保存状態の破損と判断せず、記録の時点と取得元を確認します。詳しい使い方と制限は対処ノートにまとめています。

### `manage-codex-processes.mjs`

共通コマンド：`agent codex process`

[スクリプトを表示](../tools/agent/codex/manage-codex-processes.mjs)

セッションの削除やアーカイブが「クライアントを終了してください」で止まる場合、外部のPowerShellで実行中のプロセスを確認します。WindowsとPowerShell 7が必要です。

```powershell
agent codex process status
agent codex process status --json
agent codex process close
```

`status`は読み取り専用で、プロセス名・PID・親PID・分類・ウィンドウの有無と、セッション整理を止める対象かどうかを表示します。セッション変更時の終了確認と同じ判定を使います。不明な`codex-*`補助プロセスやサービスは、名前だけで安全と判断せず、停止理由として表示します。コマンドライン、実行ファイルのパス、会話本文は表示しません。停止理由になるプロセスが残っていれば終了コード`3`、なければ`0`です。JSONの`clear`も検出件数ではなく、停止理由がないことを表します。

`codex-windows-sandbox-service.exe`は、サンドボックスの準備やインストール登録を扱う常駐サービスです。確認対象の実装では、Windowsのサービス管理機構に登録され、クライアント終了後もIPC要求を待つため、存在だけでセッション実行中とは判断しません。Windowsの登録名・登録された実行ファイル名・PIDが実行中のプロセスと対応し、取得できる場合は実行ファイルのフルパスも一致していて、配下に実行中プロセスがなく、このコマンドを動かす親でもない場合だけ、`sandbox-provisioning-service`として表示し、削除の停止理由から外します。登録情報が読めない・一致しない場合や、配下にプロセスが残る場合は停止します。内部でセットアップ処理も行うため、配下のプロセスがないことをサービス全体の完全な待機状態の証明とは扱いません。[確認対象のサービス実装（0.159.2）](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/windows-sandbox-service/src/service.rs)・[受け付ける要求](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/windows-sandbox-service/src/ipc/request.rs)・[登録名の規則](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/windows-sandbox-rs/src/service_identity.rs)

`close`は、表示したデスクトップウィンドウへの通常の終了要求を、対話確認後に送ります。指定する場合は`close --pid <PID>`を使います。アプリが保存確認などを表示する場合があり、要求を送っただけでは終了済みとは判断しません。終了後に一覧を取り直し、残っていれば表示します。対応するサンドボックス準備サービスだけが残る場合は、終了不要と表示して成功します。[通常の終了要求の仕様](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.closemainwindow)

通常の終了ができず、強制終了による未保存データの損失を受け入れる場合だけ、`agent codex process stop --pid <PID>`を使います。対象の名前とPIDを確認して`STOP <PID>`を入力する必要があります。確認後と操作直前にプロセスの開始時刻などを照合し、PIDが別のプロセスへ再利用されていれば停止します。補助プロセス・サービス、このコマンドを動かしている親プロセスは終了対象にできません。プロセスツリーの一括強制終了、自動再試行、自動再起動は行いません。

変更操作は外部の対話端末から実行してください。必要な作業内容を保存してアプリやIDE連携を終了し、`status`を再確認してからセッション整理へ進みます。整理が完了するまでCodex／ChatGPTを再起動しないでください。

### `manage-codex-sessions.mjs`

共通コマンド：`agent codex session`

操作別の説明は`agent codex session export --help`や`agent codex session delete --help`で確認できます。`list`・`plan`・`archive`・`config`も同じ形式です。`agent codex session help export`の形式でも表示でき、ヘルプだけでは履歴の読み取りや変更を始めません。全操作共通の詳細は`agent codex session help`に残しています。

[スクリプトを表示](../tools/agent/codex/manage-codex-sessions.mjs) · [期間指定・保護処理・エクスポートの設計ノート](notes/codex-session-management.md)

**実験的な機能です。Codexの内部保存形式に依存するため、互換性の検査だけで将来の形式や動作まで保証するものではありません。合成データによる回帰試験に加え、隔離した試験用ホームでCodex CLI 0.159.2の履歴読取・保存後削除を検証しています。未対応形式では削除を停止します。** Node.js 24以降と、対応する`state_5.sqlite`の保存形式が必要です。`CODEX_HOME`が指定されていればその場所、未指定なら`~/.codex`を参照します。SQLiteの保存先を個別に変更した構成には対応しません。

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

`plan <UUID>`のように個別指定することもできます。メニューから操作を選び、対象を省略した場合は、UUID・`2026-07-01`のような年月日・`4w`のような週数を入力します。削除では`exported`と入力して、後述するエクスポート記録を選ぶこともできます。Enterだけなら取り消します。`list`とアーカイブ・エクスポートの通常の`plan`は索引とファイル属性だけを読みます。削除の`plan`は履歴ファイルの先頭メタデータも読み、フォークの履歴参照を検査します。`plan delete --exported`は保存内容と元の履歴本文も検査します。いずれも読み取り専用で、サーバーや計画ファイルは作りません。

アーカイブ・削除を実行する前に、表示された親子セッションがすべて対象でよいことを確認してください。**削除後の復元機能はありません。アーカイブは同じCodexホーム内へ履歴を移す操作なので、履歴ファイル分の容量は減りません。** どちらもWindows、PowerShell 7、対応する操作と保存形式を備えたCodex CLIが必要です。Codex／ChatGPTのアプリ、CLI、IDE連携、自動実行などを終了し、処理が完了するまで再起動しないでください。共有ストレージへの別PCからの書き込みや、検査と同時に開始する処理には対応しません。

アーカイブ・削除は、起動時の更新抑止を確認したCodex CLI 0.159.2に限定しています。操作ごとに`--no-daemon`と一回限りの設定上書きを渡し、background migrationとcompressionを無効にします。利用者の設定ファイルは変更しません。未知の版やremote接続環境は停止します。操作別のヘルプ、保存形式、保護情報も検査し、各グループの操作直前に同じCLIコマンドの版を再確認します。実行途中の更新、保存内容の不一致、操作後の検証失敗も停止条件です。exportと保存済み履歴の閲覧は、このCLI版の制限を受けません。

履歴のアーカイブとは別に、アプリには関連する管理対象worktreeを自動整理する仕組みがあります。必要な作業内容は、アーカイブ前に通常の作業場所などへ保全してください。このスクリプトはworktreeを直接削除しませんが、アプリ側の整理や復元を代行・保証するものではありません。[公式のworktree整理仕様](https://learn.chatgpt.com/docs/environments/git-worktrees#worktree-cleanup)

```powershell
agent codex session archive --before 4w
agent codex session delete --before 2026-07-01
```

変更計画では、ピン留め・サイドバーのセクション所属・未完了の目標・自動実行や受信箱との関連・アプリの実行待ち情報を確認します。対応済みのピン留め移行記録は現在の保護理由に含めず、DBの現在のピン留めと従来のピン一覧を確認します。未知のピン関連項目は保護対象として扱います。UUIDの個別指定で保護理由があれば、その操作を停止します。保存形式や権限の問題で保護情報を確認できない場合は、一括処理全体を止めます。リンクされた履歴ファイルや通常の保存範囲外のファイルも変更対象外です。

確認画面に表示された文字列を入力した後、クライアントの終了状態と、対象の親子関係・更新日時・ファイル属性・保護理由を再検査します。セッション操作・保存先設定・プロセス操作の確認入力は前後の空白を取り除いて照合します。文字列の途中の空白や大文字・小文字は表示どおりに入力してください。個別指定では`DELETE <UUID>`など、一括処理では操作名・件数・計画の短い識別子を入力します。変更がなければ、重複を除いた各グループの起点に対して、公式の`codex archive`または`codex delete`を1回ずつ呼び出します。この補助コマンドでは確認を省く`--force`や`--yes`を受け付けません。削除時だけ、表示・確認・再検査した対象に限って公式CLIの`--force`を使います。

フォークの履歴参照は、索引の`thread_spawn_edges`とは別です。削除計画では通常・アーカイブ済みの履歴ファイルの先頭メタデータを読み、索引に載っていない履歴も含めて`history_base`の参照を検査します。参照元も削除条件を満たしている場合は、参照元から親へ削除する順序を組み、同じ実行で処理します。`--exported`では、同じエクスポート記録に含まれ、保存内容の検証を通過したグループだけがこの対象です。参照元が期間外・保護対象・不完全な保存などで削除条件を満たさない場合は、参照されている親のグループも除外し、残す必要があるセッションIDと参照元のIDを表示します。除外は祖先側へ伝播し、循環参照も除外します。参照元を削除範囲へ自動追加せず、ほかの削除可能なグループは続行できます。確認入力後と各グループの処理後にも検査をやり直します。参照検査に必要なメタデータが読めない場合、圧縮データが壊れている場合、同じ履歴のplainとzstdが共存する場合は、削除開始前に理由を表示して停止します。圧縮参照は索引にないものも含め、JSONLと圧縮データを終端まで検証します。[Codex CLI 0.159.2の参照検査](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/thread-store/src/local/delete_thread.rs)も、削除前に外部のフォーク履歴参照を確認します。親だけが期間内でも、参照元を残す間はその親も必要です。後日、参照元も期間内になったら新しくエクスポートし、その記録を使って削除してください。

各グループについて、削除後は索引と履歴ファイルから対象が消えたこと、アーカイブ後は子孫も含めてアーカイブ先へ移ったことを確認します。残りのグループも処理直前に再検査します。途中失敗や確認不能の場合は、確認済みの起点UUIDと、一部が既に変更されている可能性を報告して停止します。一括処理全体を巻き戻す機能や自動再試行はありません。再実行の前に`list`で残っている対象を確認してください。作業ディレクトリや成果物の削除、データベースの直接編集・圧縮は行いません。

保存用エクスポートは、アーカイブ・削除とは別の操作です。次は、既に存在する外付けドライブ上の`E:/CodexExports`へ、指定日より前の履歴を書き出す例です。保存先は自分の環境に合わせて置き換え、十分な空き容量を用意してください。

```powershell
agent codex session export --before 2026-07-01 --output 'E:/CodexExports'
```

保存先を毎回指定しない場合は、`agent codex session config --output 'E:/CodexExports'`で対話確認後に記録します。以後の`export`では`--output`を省略でき、指定すればその回だけ別の場所へ保存します。保存先が未設定の場合は対話で尋ねます。別ドライブも指定でき、未接続・不存在なら停止して、別の場所へ勝手に保存しません。

設定ファイルは`~/.agents/ai-dotfiles/codex-session-export.json`です。形式のバージョン、現在の保存先、変更前の保存先一覧だけを持ち、セッション索引は持ちません。`agent codex session config`は、対話端末では現在・過去の保存先の確認と切り替え、非対話では表示だけを行います。新しい保存先のパスか、一覧の番号を入力し、`SET EXPORT DIRECTORY`で確定します。**設定変更だけでは、既存ファイルを移動・削除しません。** 過去の保存先は`history ... --in <フォルダー>`や`delete --exported ... --in <フォルダー>`で指定できます。通常の検索で過去の全保存先を自動走査することはありません。

保存済みデータも別ドライブへ移したい場合は、まず利用者側で保存フォルダー全体を新しい場所へコピーし、`agent codex history check --in 'F:/CodexExports' --all-versions`で検査します。後述する`batches/`も一緒にコピーしてください。検査後に`config --output 'F:/CodexExports'`で切り替えます。スナップショット名は変えず、旧データの削除は新しい保存先の内容を確認してから別途判断してください。

確認後、保存先にセッションごとの`<書き出しUTC日時>_<UUID>_<識別子>/`を作ります。一括エクスポートでもプロジェクト単位にはまとめず、各フォルダーを独立した参照用スナップショットとして扱います。同じ内容の検証済みスナップショットがあれば`Unchanged`として重複保存せず、変更があれば新しいフォルダーを作ります。保存完了後は、今回保存・再利用したスナップショットの組を`batches/<日時とID>.json`にも記録します。既存の出力や元の履歴は上書き・アーカイブ・削除しません。Codexホーム内とGitリポジトリ内への出力は拒否します。開始前の容量検査は計測済み生ログと64MiBの余裕だけなので、関連履歴・添付物を含めて十分な空き容量を用意してください。

- `manifest.json`：新規出力は形式v3。タイトル・UUID・更新時刻・プロジェクト情報・親子関係・保存ファイル名・SHA-256・添付物の由来・欠落警告を記録します。`complete: true`は書き出し処理の完了であり、内容の完全性や復元可能性を保証しません。
- `conversation.md`：ユーザーとアシスタントの対応済みメッセージを、元ログの行番号付きで保存します。ツールの実行結果は検索対象にせず、生ログに残します。複数の記録形式が混在する場合は重複することがあり、警告します。Codex画面の厳密な再現ではありません。
- `rollout.jsonl`または`rollout.jsonl.zst`：選択したセッションの元ログを、元の形式・バイト列のまま保存します。
- `history.jsonl`：対応する履歴DBがある場合、選択したセッションが所有する全rollout IDと、旧形式との互換用のセッションIDに属するDB行を元のテーブル名付きで保存します。参照先の親セッションのDB行や、DB全体はコピーしません。
- `attachment-metadata.jsonl`：対象セッションの添付関連DB行を保存します。関連先のファイルやworktreeのコピーではありません。
- `message-board.jsonl`：対応するボードDBがある場合、対象セッションIDが所有する行だけをテーブル名付きで保存します。
- `dependencies/`：分岐元の履歴を参照している場合、展開後の指定バイト境界までをJSONLとして保存します。参照範囲より後の会話は含めません。参照先がない・候補が複数の場合は欠落警告を残し、壊れた圧縮データでは保存を中止します。
- `attachments/`：対応形式の画像・音声を取り出したファイルです。同一内容は同じスナップショット内で共有します。
- `README.txt`：保存内容と制限を記載します。

コピーと履歴データのハッシュを検証し、最後に元セッション・所有rollout ID集合・依存ログ・収集したローカル添付物も再検査します。履歴DBとボードDBは読み取り専用のトランザクションで参照し、処理中の別接続からのコミットやDBの新規出現も検知します。検証後に完了manifestを作り、`.incomplete-...`という作業フォルダーを通常の名前へ変更します。失敗時は未完了フォルダーを残して検索対象から外し、既に公開済みのスナップショットがあれば件数を報告します。一括処理全体の巻き戻しや自動再試行はしません。エクスポート時も書き込み元を終了し、処理中は再起動しないことを推奨します。並行更新下での完全な整合性は保証しません。

DBの保存範囲は、manifestの`coverage.indexedHistory`に`owned-rollout-ids-v1`として記録します。この記録がない旧v2も閲覧・検索・整合性検査はできますが、`delete --exported`には新しいエクスポートが必要です。旧出力を削除して作り直す必要はありません。元セッションが既に削除済みの場合、旧出力から当時のDB行の完全な保存を証明したり、不足分を追加取得したりはできません。これは生ログの欠落が確認されたという意味ではなく、保存済みファイルの整合性と収録範囲は別途確認できます。

添付物は、ログの入力データに埋め込まれた対応形式の画像・音声を回収します。元ファイルそのものとは限りません。構造化されたローカル参照がCodexホームの`attachments/`内を指す場合は自動で収集します。Codexホーム外のローカル参照を追加で収集する場合は、`--attachments-from 'E:/ChatAttachments'`で許可するフォルダーを明示します。その範囲内の通常ファイルだけを最大48MiBまで読み、現在のファイルのコピーであることを記録します。本文に書かれたパス、ツールの出力、URLからは収集しません。PDFやソースコードなど、本文上の添付表示しか確認できないファイルの自動回収は未対応です。作業ディレクトリはコピーしません。

元データを変更しないため、保護対象も保存できますが、読み取れないファイルや期間外の子孫を持つグループは除外します。必要なDBがない・元ログが壊れている場合などは停止します。終了コード`0`は対応範囲内で警告なし、`3`は保存済みだが欠落などの警告あり、`1`は失敗、`2`は引数エラーです。`3`の場合は`history check`で内容を確認してください。**履歴には個人情報や認証情報が含まれ得ます。公開用の匿名化はしません。** ハッシュ検証はウイルス検査や真正性の証明ではなく、Codexへの再取り込み・元どおりの再開も提供しません。

保存内容や元データの照合では、`Progress`として処理段階と確認済み件数／総件数を表示します。端末では同じ1行を更新し、長いコピー・ハッシュ照合・会話読み取りでは読み取り量も表示します。警告・保存結果・確認入力の前には進捗行を消すため、途中経過で画面が埋まりません。リダイレクト先や行更新に対応しない端末では、段階の開始・完了と、長い処理の最大30秒ごとの途中経過を通常の行で出力します。作業フォルダーは失敗時に表示し、保存の完了は`Saved`、エクスポート記録の作成は`Export batch`で確認できます。削除計画では親子グループ、エクスポートではセッションが件数の単位です。件数は全体の所要時間や残り時間の推定ではありません。アーカイブ・削除は重い照合の前に実行中プロセスを確認し、確認入力後と各グループの操作直前にも再確認します。停止時には検出したプロセス名とPIDを表示します。

#### 圧縮履歴の対応範囲

圧縮済みの`.jsonl.zst`も、同じ`export`コマンドで保存できます。圧縮履歴の読取・保存・検証には**Node.js 26.10.0以上の安定版**が必要です。26.10.1以降のpatch・minor・major更新も受け付けます。最低版未満とプレリリース版では圧縮処理を停止します。受入試験の実施版は26.10.0であり、将来版をすべて実機検証済みという意味ではありません。元のCodexホームで解凍したり、圧縮設定を変更したりする必要はありません。保存先の`conversation.md`は従来どおり検索・閲覧でき、`codex-history`プラグインも同じコマンドを利用します。

新しいv3は、所有する全物理ログの一覧・元バイト数とSHA-256・展開後バイト数とSHA-256を記録します。新規バッチはv2です。既存のv2保存物とv1バッチも読み続けますが、新規v3の重複排除には流用せず、必要なら新しいスナップショットを作ります。古い保存物は消さずに残してください。保存後の再圧縮・ファイル追加・内容変更があれば再exportが必要です。同じrolloutのplainとzstdの共存や別ディレクトリへの重複配置は、初期対応では停止します。

圧縮された元履歴の削除は、v3保存物とv2バッチを検証した`delete --exported`に限定します。Nodeの対応条件に加え、Windows・Codex CLI 0.159.2・書き込み元の終了と、既存の保護・参照・DB照合が必要です。圧縮された対象の直接削除・アーカイブには対応しません。未知のpaginated schemaによる`lineage-boundary-unverified`も、引き続き削除停止の理由になります。保存・検索できることと、削除を許可できることは別です。

読取は逐次処理し、1ファイルにつき物理入力8GiB、展開後32GiB、展開窓と1レコード128MiB、1回の読取10分を上限にします。export・削除計画・フォーク参照検査では、共通の履歴readerで再読回数を含む累積入力64GiB・展開256GiBでも停止します。exportのstream出力は累積64GiBが上限です。上限を変更する利用者向けオプションはありません。上限超過では未完了出力を削除の根拠にしません。exportの対象範囲は分割できますが、削除に必要な参照検査は両履歴ディレクトリの全体を調べるため、対象を減らしても上限を超える場合があります。保存先には展開した依存prefix、Markdown、添付物の分も必要です。空き容量の事前表示だけでは全出力量を予測できません。

Windowsの合成fixtureと隔離homeの公式CLIで圧縮・export・削除を検証しています。macOS／Linuxの実機確認、停電後の保存耐久性、全paginated schemaへの対応は未完了です。

#### エクスポートした組をまとめて削除する

処理の末尾では、保存警告を理由別・セッション数で、対象外のグループを理由別・親子グループ数で集計します。同じ対象に複数の理由がある場合、理由別件数の合計は対象数より多くなります。対話メニューの終了表示にも、終了コードだけでなく、そのツールでの意味を添えます。終了コード`0`には取り消しも含まれるため、実際に何が完了したかは各操作の結果表示を確認してください。

対話式のエクスポート完了後は、元データを残すか、今回の保存対象について削除計画を確認するかを選べます。Enterの既定値は「残す」です。削除計画へ進んでも、表示された対象の別途確認が必要です。`--after keep`なら後続の質問を省き、`--after review-delete`なら削除計画へ進みます。

後日まとめて整理する場合は、次のコマンドで保存先・エクスポート記録を選べます。**削除するのはCodex側の元セッションで、エクスポートしたコピーは残ります。** 先にCodexなどのクライアントを終了してください。

```powershell
agent codex session delete --exported
```

エクスポート記録は、その回のUUID・親子グループ・元の状態・保存ファイルへの相対参照を保持します。削除時に期間条件を再計算しないため、後から古くなった別セッションを巻き込みません。記録は元のCodexホームにひも付き、別PCや移動後のCodexホームの削除には使えません。保存先フォルダー全体の移動は可能です。

元の会話・履歴DB行・親子関係・保護状態が変わったグループや、保存ファイルが欠けている・ハッシュが合わない・依存履歴や外部添付が未収集のグループは除外します。生ログを完全に保存・照合できた場合、表示形式の制約、会話のない履歴、本文中のファイルへの言及、空・未対応の埋め込みデータ、書き出し時点で既に存在しない構造化ローカル添付だけでは除外しません。不存在の添付が再出現した場合は再エクスポートを要求します。これらは警告として残り、読める会話や添付の復元を保証しません。

Windowsの拡張パスと、セッションIDとは別の履歴IDを持つファイル名に対応します。同じセッションに追加の履歴ファイルがある場合は`rollouts/`へ保存し、削除前に全ファイルの内容を照合します。revert元として参照する自身の古い履歴も全体を一度だけ保存し、参照するprefixの境界は別途検証します。保存中に同じIDの別ファイルが追加された場合も検出し、未保存・変更済みの所有ファイルがあれば完了扱いにしません。リンクを含む履歴一覧は読み飛ばさず、検査できないものとして停止します。

削除後は、索引・所有する全履歴ファイル・所有IDに対応する履歴DBの4テーブルを確認します。ファイルが残る場合は対象IDを、DB行が残る場合はその理由を表示して停止します。再検査でストレージ構成や保護情報を確認できなくなった場合も成功扱いにしません。後日の再計画でも、保存時の所有ID情報を使って残存ファイルとDB行を確認します。所有ID情報がない旧保存物や変更されたmanifestでは、DB行の不在を証明できないため確認を求める除外になります。ここで元データやDB行を自動修復・追加削除することはありません。

paginatedまたは`history_base`を持つ履歴では、UTF-8・JSONLのbyte境界とordinalの対応を追加検査し、`coverage.lineage`へ記録します。検証policyは`rollout-prefix-v2`です。圧縮の有無にかかわらず、連続ordinalに加え、metadata、会話の開始・終了、ターン設定、メッセージ・推論・ツール呼出しと戻り値、対応する`item_completed`、トークン使用量などを入れ子の項目まで検査します。会話を短縮するcompactionのcheckpoint・保持文脈、MCPの完了項目、待機・Web検索・画像生成の既知の拡張項目も対象です。公式CLI 0.159.2の型定義に基づく部分的な対応であり、全schemaに対応するものではありません。

音声会話の保存記録では、開始・終了、文字起こし、通常項目との対応を検査します。文字起こしは`conversation.md`へ表示します。音声そのものの復元は提供しません。安全性分類スコアはrawに保持し、会話表示には含めません。

開発作業の記録では、ファイル変更、レビュー開始・結果、hook、サブエージェント操作・活動、hosted Web検索・画像処理の完了項目と、エージェント間通信も検査します。ファイル変更の辞書、レビューの入れ子、エージェントID・状態・役割の別名を含む検証です。記録に含まれるパスや送信先はrawのデータとして保持し、親子グループと継承履歴の対象範囲は既存の選択・参照規則で決まります。

エージェント用メッセージボードは履歴ログとは別のDBです。exportは対象セッションIDが所有する投稿・チャンネル・購読設定・削除済みの印を`message-board.jsonl`へ保存し、範囲を`coverage.messageBoard`の`root-board-v1`で記録します。SQLiteの整数は`{"$integer":"十進表記"}`として丸めずに保存します。ボード本文は`conversation.md`の表示・検索には含めません。DB全体や、親・通信相手が所有する別ボードはコピーしません。

ボード情報を持つセッションは、保存内容と元DBの照合を通った`delete --exported`で削除できます。直接削除は停止します。確認後と各グループの削除前にも照合し、削除後と再計画では投稿・チャンネル・購読情報の不在を確認します。公式が残す削除済みの印だけでは未完了扱いにしません。未知・破損・読み取り不能のDBはexportと削除を停止します。

ボードcoverageのない旧保存物も閲覧できます。現在の対象にボード情報がなければ旧保存物による削除を許可し、情報があれば再exportを要求します。新しいcoverageがある場合は、DBの有無と対象の保存行を比較するため、追加・変更・消失があれば再exportが必要です。既存の保存物を先に消す必要はありません。

添付関連の`thread_attachments`は`coverage.attachmentMetadata`（`thread-attachments-v1`）として保存・照合します。本文のJSONやパスは解釈せず保持し、関連先へアクセスしません。添付情報を持つセッションの直接削除は停止し、旧保存物は現在の対象に未保存の添付情報がない場合だけ削除に使えます。未知のDB構造や保存後の変更、削除後の残存は成功扱いにしません。

公開前と、各グループのexported deletion直前に、保存member・manifest・バッチをOSへ同期します。同期に失敗すれば元セッションを削除せず停止します。既存保存物を再利用する場合も同期します。この操作は保存内容を書き換えませんが、Windowsでは同期用の書込ハンドルが必要なため、読み取り専用の保存先では削除を停止します。`history check`と削除計画は同期を行わず、読み取り専用です。POSIXでは保存ディレクトリも同期します。Windowsでのディレクトリ同期と、機器のキャッシュを含めた停電耐久性は保証しません。

未対応schemaはrawを保存して`lineage-boundary-unverified`を警告し、`delete --exported`の対象外にします。警告には最初の理由と保存memberの行番号を含めます。理由はmetadata未対応、record schema未対応、ordinal欠落、ordinal不連続を区別します。realtimeの保存記録、目標更新、旧形式のツール完了イベント、保存対象のresponse itemにも対応しています。基準版の入れ子型にも未対応の値域・パス表現があり、未知の拡張型や将来の追加項目は対象外です。compactionでも入れ子に未対応の履歴を含む場合や、置換履歴とmetadataの件数が合わない場合は削除を許可しません。旧v2や旧policyの保存物も閲覧できますが、旧policyまたは境界検証の記録がない保存物による削除には再exportが必要です。既存の保存物を先に消す必要はありません。

このschema追加ではpolicyを変更していません。同じpolicyで検証済みの保存物は、削除前の再照合を通れば引き続き使えます。以前に未検証の警告付きで保存したものは、新しい実装で再exportしてください。compactionの置換履歴・保持文脈やMCPの結果も元のrawに保存しますが、`conversation.md`は元ログのメッセージを読むための表示です。短縮前の全文の復元や、checkpoint・ツール結果すべての表示・検索を保証するものではありません。

保存ファイルのハッシュ照合は最大2ファイルを並列に読み、失敗時も開始済みの読み取りが終わってから停止します。公式CLIのバージョン確認と操作は同じPowerShell起動にまとめます。削除はフォーク参照の順序を守って1グループずつ実行し、共有DBへの同時書き込みは行いません。確認後と各グループの処理直前にも再検査します。除外がある削除は終了コード`3`で区別し、索引・所有ファイル・対象DB行の不在を確認できたグループだけなら警告にはしません。エクスポート記録だけでは削除を許可せず、復元可能性も保証しません。

#### 削除済みチャットがサイドバーに残る場合

アプリは履歴DBとは別にサイドバー用の一覧を保存します。外部CLIで削除したチャットがこの一覧に残ると、アプリを再起動しても表示され、選択時に`no rollout found for thread id`となることがあります。

削除成功を検証した後、対応するアプリのキャッシュがあれば、次回起動時の全件照合を自動で予約します。途中で後続グループの削除が失敗した場合も、既に予約した照合は維持します。以前の削除分が残っている場合は、Codex／ChatGPTとCLI・IDE連携を終了し、外部のPowerShellから次を実行します。

```powershell
agent codex session refresh-sidebar
```

`REFRESH SIDEBAR`を入力すると、ローカル一覧の照合済み記録と途中の走査記録を更新します。変更前の走査状態は`CODEX_HOME/backups/sidebar-refresh/`へ保存します。履歴ファイル、一覧の項目、プロジェクト、worktreeはこのコマンドでは削除せず、実際の一覧整理は次回起動したアプリ自身が行います。予約済みなら重ねて変更しません。起動後の走査が終わるまでは、古い表示が残る場合があります。

Windows、Node.js 24、クライアントの終了、対応するキャッシュ構造が必要です。未知の列・トリガー・外部キーなどは変更せず停止します。削除自体は完了していても、一覧の更新予約に問題がある場合は理由を表示し、終了コード`3`で区別します。非対話では`refresh-sidebar --dry-run`の確認トークンを`--confirm`へ渡します。

#### 対話を使わずに実行する

エージェントやリダイレクトした端末では、`plan`で対象を確認し、表示された64桁の`Confirmation token`を`--confirm`へ渡します。これは秘密の認証情報ではなく、対象状態・操作・保存先を確認するための値です。対象が変われば一致しなくなり、計画を確認し直す必要があります。以下の`<export-token>`などは、それぞれの計画に表示された値へ置き換えてください。

次は4週間前より古いセッションを保存する例です。`--after keep`は元データを残します。`--confirm`を使う場合の`--after review-delete`は削除計画の表示までで、自動削除しません。

```powershell
agent codex session plan export --before 4w --output 'E:/CodexExports'
agent codex session export --before 4w --output 'E:/CodexExports' --confirm <export-token> --after keep
agent codex history batches --in 'E:/CodexExports' --json
```

元セッションの削除は取り消せません。保存内容を確認し、Codexなどのクライアントを終了したうえで、一覧のバッチIDを`<batch-id>`に指定します。保存後に表示される次の確認用コマンドにも、このIDが含まれます。エクスポートの確認トークンを削除へ流用することはできません。

```powershell
agent codex session plan delete --exported <batch-id> --in 'E:/CodexExports'
agent codex session delete --exported <batch-id> --in 'E:/CodexExports' --confirm <delete-token>
```

保存先設定も、`config --output 'F:/CodexExports' --dry-run`で変更予定を確認してから、同じコマンドの`--dry-run`を`--confirm <config-token>`へ置き換えることで非対話実行できます。アーカイブ・削除では、確認トークンを指定しても、クライアントの終了・CLIバージョン・保護処理の検査は省きません。

親子を含む削除範囲は[公式のセッション削除仕様](https://learn.chatgpt.com/docs/app-server#delete-a-thread)に基づきます。読み取り側はCodexの内部保存形式に依存するため、将来の更新で利用できなくなる可能性があります。

### `manage-codex-history.mjs`

共通コマンド：`agent codex history`

[スクリプトを表示](../tools/agent/codex/manage-codex-history.mjs)

書き出したv2・v3フォルダーだけから一覧・検索・行指定の参照・整合性検査を行います。元のCodexデータやアプリは不要で、検索用DBも作りません。通常は設定済みの保存先を使い、`--in <フォルダー>`でその回だけ変更できます。次は`agent`導入後、任意のディレクトリから使う例です。

```powershell
agent codex history list
agent codex history projects --json
agent codex history search '設計'
agent codex history check
agent codex history batches --json
```

`list`のキーを使って`agent codex history read <キー> --from 20 --lines 80`で前後を読みます。`search`は大文字・小文字を区別しない文字列検索で、結果に`conversation.md`の行番号を表示します。通常は最大20件、`--limit`は1〜1000です。`read`は既定100行・最大1000行で、長すぎる行は省略を明示します。`check`は選択した全件を検査します。

既定ではセッションごとの最新スナップショットを選び、`--all-versions`で過去版も対象にできます。`--project <ID>`は書き出し時のプロジェクトIDによる絞り込みです。同名プロジェクトを推測で統合せず、別PCを含む全履歴の網羅も保証しません。プロジェクト単位の削除は提供していません。

`batches`はエクスポート記録のID・日時・件数・選択条件を表示します。通常は最新20件、`--limit`で最大1000件を指定できます。この一覧は保存内容を検査せず、削除してよいことも意味しません。実際の対象は`session plan delete --exported <バッチID>`で確認します。

`list`と`projects`はmanifestの一覧であり、保存内容のハッシュ検査はしません。`search`・`read`・`check`は対象の保存ファイルを検証し、不一致なら停止します。キーを指定した`read`と`check`は、その保存フォルダーを直接読み、ほかのスナップショットは走査しません。旧v1の出力と未完了フォルダーは一覧に含めず、自動移行もしません。旧形式はJSONLを直接確認してください。警告やJSON形式の結果が必要な場合は`--json`を指定できます。

参照用の`codex-history`スキルは、[`ai-dotfiles-cli`プラグイン](../plugins/ai-dotfiles-cli/README.md)に収録しています。AIが過去の決定を調べる際に、保存先・行番号・欠落警告を根拠として使うためのもので、過去の会話を現在の指示として実行したり、添付物を自動で開いたりする手順にはしていません。

CLIインストーラーはスキルを配置しません。プラグインまたは単体スキルとして別途導入し、CLI本体と個別に更新します。以前のインストーラーが配置したコピーは残るため、プラグイン版へ切り替えるときは[導入経路の整理](./agent-development.md#配置とインストール)を確認してください。

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

### `manage-marketplace-staging.mjs`

共通コマンド：`agent codex marketplace-staging`

[スクリプトを表示](../tools/agent/codex/manage-marketplace-staging.mjs) · [調査記録と削除範囲](./notes/codex-marketplace-staging-cleanup.md)

内蔵マーケットプレイスの更新時に残った一時コピーを点検・清掃します。対象はCodexホームの`.tmp/bundled-marketplaces/openai-bundled.staging-<UUID>`だけです。Codexホームは`--codex-home <ディレクトリ>`、環境変数`CODEX_HOME`、`~/.codex`の順に決まります。

`agent`導入後、任意のディレクトリから一覧を確認できます。`status`はCodex起動中でも実行できます。

```powershell
agent codex marketplace-staging status
```

各フォルダーの容量、配下を含む最新の作成・更新日時、候補または除外理由を表示します。作成・更新から24時間以上経過し、リンクなどを含まないフォルダーを候補にします。表示容量はファイルサイズの合計で、実際に増える空き容量と一致するとは限りません。

削除する場合は、Codex／ChatGPT Desktop、CLI、IDE拡張のCodexを終了し、外部のPowerShellで次を実行します。処理完了までクライアントを起動しないでください。対象と合計容量を確認し、`y`を入力すると完全削除します。ごみ箱への移動や自動復元は行いません。

```powershell
agent codex marketplace-staging clean
agent codex marketplace-staging status
```

削除前にプロセス、ロック、パスとファイルのメタデータを再確認します。確認後の変更、プロセス確認の失敗、更新用ロックを検出すると停止します。シンボリックリンク、ジャンクション、ハードリンクを含む対象は除外し、対象の祖先がリンクなら操作を拒否します。通常の`openai-bundled`、プラグインキャッシュ、自作スキル、履歴や設定は削除対象に含めません。

清掃コマンド同士は専用ロックで排他しますが、Codex本体との排他は保証しません。強制終了後にロックが残った場合は自動解除せず、実行中の清掃がないことを手動で確認します。途中で失敗した場合は、削除済み件数を表示します。処理中だったフォルダーは一部だけ削除されている可能性があるため、`status`で残りを確認してください。

終了コードは、正常終了・取り消し・対象なしが`0`、検査や削除の失敗が`1`、引数の誤りが`2`、除外された項目が残る場合が`3`です。`clean`には対話端末が必要で、確認を省略するオプションはありません。清掃は残骸の除去であり、Codex本体の不具合修正や再発防止ではありません。

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
- `manage-marketplace-staging.mjs`：Windows、Node.js 24以降
- `manage-skill-validator-utf8-patch.mjs`：Node.js 18以降。`apply`による実検証には、PyYAMLを読み込める`python`コマンド
- `manage-sqlite-trace-log-suppression.mjs`：組み込みの`node:sqlite`を利用できるNode.js 22.5以降
- `manage-codex-sessions.mjs`：Node.js 24以降。`archive`と`delete`にはWindows、PowerShell 7、対応する操作と保存形式を備えたCodex CLIも必要
- `manage-codex-history.mjs`：Node.js 24以降。全OS向けですが、macOS／Linuxでは実機未検証
