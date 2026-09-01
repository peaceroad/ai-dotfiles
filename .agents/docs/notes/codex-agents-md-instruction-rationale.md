# `~/.codex/AGENTS.md`の指示と設計理由

このノートは、`~/.codex/AGENTS.md`にある指示について、英語の指示文、日本語訳、設計理由、確認時点のシステム／開発者指示との関係、運用上の補足を整理したものです。既存の指示は2026年8月11日に整理し、`Waiting`は2026年9月1日に追加しました。

OpenAIの公式ドキュメントによると、Codexは作業前に`AGENTS.md`を読み、`~/.codex/AGENTS.md`を共通の既定として使用します。このファイルには、複数の作業で継続して必要になる環境固有の約束やユーザーの安定した好みを置きます。

`AGENTS.md`はシステム指示や開発者指示より上位になるものではありません。各セクションの「現在の上位指示との関係」は、その指示を整理または追加した時点のCodexセッションで確認できたシステム／開発者指示との比較です。同じ趣旨が含まれる場合は、`AGENTS.md`が追加する具体的な条件や、ユーザーの共通設定として保持する役割を確認します。

## 上位指示の確認方法

このノートには、システム指示や開発者指示の英語原文を転載しません。これらはこのリポジトリで管理する成果物ではなく、Codexアプリ、実行モード、セッションなどによって変わり得ます。一部だけを複製すると、更新後も現在の上位指示であるように見えたり、前後の条件を欠いたりするためです。各セクションでは、確認時点の上位指示と重なる点や、`AGENTS.md`が追加する点だけを要約します。

セッションへ実際に投入された内容は、通常、`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`で確認できます。アーカイブ済みのセッションは`~/.codex/archived_sessions/rollout-*.jsonl`へ移動します。[CodexリポジトリのDiscussion](https://github.com/openai/codex/discussions/12668)でも、投入された内容を確認する実用的な方法として、最新のrollout JSONLを調べる手順が示されています。

2026年8月11日時点のCodexアプリで確認したrollout JSONLでは、基礎となる指示が先頭の`session_meta.payload.base_instructions.text`にあり、追加の開発者指示は、`type`が`response_item`、`payload.type`が`message`、`payload.role`が`developer`のレコードに入っています。保存形式は更新で変わり得るため、固定の行番号ではなく、これらのキーと値で対象を確認します。

`~/.codex/AGENTS.md`と`~/.codex/instructions.md`はローカルのユーザー側指示であり、Codex組み込みのシステムプロンプトの正本ではありません。`.codex`内に、すべての上位指示を常に表す単一の`system-prompt.md`があるわけでもありません。rolloutにはユーザーの入力、ツールの入出力、ローカルパスなども含まれるため、ファイル全体を公開用リポジトリへコピーせず、確認に必要な最小限の情報だけを参照します。

## Response quality

このセクションは、回答を短くすること自体ではなく、理解に必要な内容を保ちながら重複を減らし、回答の根拠関係を明確にするための指示です。

### 指示文

```md
## Response quality

- Provide the context, supporting explanation, and caveats needed for the user to understand the answer. Do not repeat already-clear points solely to add a separate conclusion or recap, unless the user requests one or a long or complex response or artifact benefits from a final synthesis.
- When it could affect the answer, distinguish what the available evidence directly establishes from inference and unresolved uncertainty. Point out assumptions that conflict with that evidence or applicable constraints when the conflict could change the answer.
```

### 日本語訳

> ユーザーが回答を理解するために必要な文脈、裏付けとなる説明、注意事項を含めます。すでに明確になっている点を、独立した結論や要約を付けることだけを目的に繰り返しません。ただし、ユーザーが求めた場合、または長く複雑な回答や成果物が最終的な整理によって理解しやすくなる場合は、この限りではありません。
>
> 回答に影響する場合は、利用できる根拠から直接確認できることと、推論したこと、未解消の不確実性を区別します。その根拠や適用される制約と矛盾する前提があり、矛盾によって回答が変わり得る場合は、その前提を指摘します。

### 背景と理由

第1の指示は、回答本文ですでに判断と理由を説明しているにもかかわらず、末尾に独立した「結論」や「まとめ」を付けて同じ内容を繰り返すことを防ぎます。一方、単に「簡潔に書く」と指示すると、根拠、前提、注意点、未解決事項など、理解に必要な内容まで削られるおそれがあります。

この指示は、削ってよいものを「結論や要約を作るためだけの反復」に限定し、必要な説明を先に保護しています。`solely`が反復を禁止する範囲を絞り、例外部分が、ユーザー指定の要約や長文成果物に有益な最終整理を残します。

第2の指示は、確認できた内容と推定した内容を同じ確度で述べることを防ぎます。ここでいう`available evidence`は、ユーザーが提示した資料だけでなく、作業中に確認したソース、ファイル、ログ、エラーメッセージ、コマンド出力、テスト結果などを含む広い表現です。具体例を指示文へ列挙しないことで、診断以外の調査、レビュー、通常回答にも適用できます。

ただし、すべての回答を「事実」「推論」「不確実性」という見出しに分ける指示ではありません。区別によって回答が変わる場合だけ、文章上わかる形にします。また、根拠や制約と矛盾する前提も、回答へ影響する場合に限って指摘するため、軽微な言葉のずれを毎回訂正する規則にはなりません。

### 現在の上位指示との関係

現在の開発者指示には、重要な情報を中心に書くこと、不要に長くしないこと、複雑な内容を読み直さず理解できる形で伝えることが含まれています。ただし、「本文で明確になった内容を、独立した結論を作るためだけに繰り返さない」という境界は明示されていません。第1の指示は、この境界をユーザーの継続的な好みとして補います。

現在の上位指示には、証拠に基づいて診断すること、重要な仮定や不確実性を示すこと、ユーザーの前提が証拠や制約と矛盾する場合は具体的に説明することも含まれています。そのため、第2の指示は方向として一部重なります。一方、特定のスキルを使わない通常回答を含めて、直接確認できた内容、推論、未解消の不確実性を区別するという一つの短い応答規則は、上位指示の各所に分かれた要素をユーザーの既定として安定させる役割があります。

第1の指示は、公式のGPT-5.6向けガイダンスが勧める、必要な内容を保ちながら反復を減らし、短い回答で保持すべき情報を具体化する方針とも整合します。

### 補足

この指示は、結論から書くことや結論を常に省くこと、回答全体を一律に短くすることを求めません。必要な判断、理由、根拠、注意点、検証結果、残る制約は省かず、理解しやすい位置で明確に述べます。

## Waiting

このセクションは、外部処理やサブエージェントの結果を待つ間に、主担当が成果へ寄与しない分析、再計画、進捗説明、個別ポーリングを続けることを防ぎます。同時に、利用可能になった部分結果で有用な作業を進められる場合まで、常に全件の完了を待つ規則にはしません。

### 指示文

```md
## Waiting

- Continue substantive work only while another action can materially advance or verify the requested outcome. Treat unchanged or non-actionable status as a wait signal unless it establishes a stall or another stop condition; do not fill the interval with speculative analysis, repeated replanning, routine status narration, or unrelated work.
- For in-flight operations or subagents, use partial results when task-specific dependencies and version constraints allow useful work to proceed. Wait for all only when a dependency, comparison, version lock, or synthesis requires the complete set; otherwise use the runtime's supported wait mechanism instead of polling.
- When progress depends only on a future time or external state change, preserve only the state needed to resume in runtime-owned state or an already-authorized project state location, use a supported monitoring mechanism when continued monitoring is authorized, and yield the turn. On wake, reconcile current state before acting; if nothing actionable changed, return to waiting, back off when the workflow permits, and stop recurring monitoring when the task ends.
```

### 日本語訳

> - 別の行動によって依頼された成果を実質的に前進させるか検証できる間だけ、実作業を続けます。状態に変化がない場合や、変化していても行動につながらない場合は、停滞や別の停止条件が成立したと確認できる場合を除き、待機の合図として扱います。その間を、推測的な分析、繰り返しの再計画、定型的な進捗説明、無関係な作業で埋めません。
> - 実行中の処理やサブエージェントがある場合は、タスク固有の依存関係とバージョン制約が許すとき、部分結果を有用な作業に使います。依存関係、比較、バージョン固定、統合に完全な一式が必要な場合だけ全件を待ち、それ以外では個別にポーリングせず、実行環境が提供する待機手段を使います。
> - 将来の時刻または外部状態の変化だけが進行条件になった場合は、再開に必要な状態だけを、実行環境が管理する状態またはすでに許可されたプロジェクト内の状態保存先へ残します。継続監視が許可されている場合は、対応する監視手段を使い、ターンを終了します。再開時は、行動前に現在の状態と整合させます。行動可能な変化がなければ待機へ戻り、ワークフロー上可能なら確認間隔を延ばし、タスク終了時には定期監視を停止します。

### 背景と理由

長時間タスクで消費を抑えたい対象は、待機手段そのものより、結果が返るまでの空白を主担当が低価値な思考や出力で埋める挙動です。第1の指示は、次の行動が成果の前進または検証に寄与するかを継続条件にします。変化がない状態だけでなく、変化していても次の行動を可能にしない状態を待機として扱うため、意味のない再分析や進捗説明を抑えられます。一方、同じ状態が停滞判定や停止条件の成立を示す場合は、その判定を有用な作業として残します。

第2の指示は、複数の処理やサブエージェントを一律に扱わないための規則です。一つの結果で後続作業を開始できるなら利用し、比較や統合に全結果が必要なら待ちます。とくに、同じ版の成果物に対する複数のレビューや、入力の組がそろわないと成立しない統合では、先に返った結果だけで対象を更新すると、残りの結果が古い版を参照することがあります。`version constraints`と`version lock`は、このようなタスク固有の制約を、グローバル指示が誤って弱めないための表現です。

第3の指示は、同じターン内で実行中処理を待つ場合と、将来の時刻や外部変化までターンをまたいで監視する場合を分けます。前者は実行環境の待機手段を使い、後者は継続監視が依頼の範囲で許可されている場合だけ、スケジュール実行やheartbeatなど利用可能な監視手段を使います。状態の保存先を実行環境または既存の許可済み領域に限定することで、待機を理由に新しいファイルや外部状態を勝手に作ることも避けます。

### 現在の上位指示との関係

2026年9月1日時点の上位指示には、実行中の別タスクを追跡するときに専用の待機手段を使うこと、変化のない状態を繰り返し説明しないこと、待機では利用可能な監視機構を使うことが含まれています。サブエージェント用のツール契約にも、個別の短いポーリングを避け、長めの待機を選ぶための手段があります。そのため、待機手段の選択や定型的な進捗説明の抑制は一部重なります。

一方、現在の上位指示だけでは、複数の実行中処理から得た部分結果をいつ使い、いつ全件を待つかという一般的な判断基準や、待機中に推測的な分析と再計画を増やさないという利用者共通の境界が、一つの規則としてまとまっているとは限りません。このセクションは、その境界を実行環境や特定のサブエージェント構成に依存しない形で保持します。

### 補足

この指示は、サブエージェントの起動、定期監視、状態ファイルの作成に新しい権限を与えません。サブエージェントは現在の依頼と適用される上位指示が許す場合だけ使い、監視も継続監視が許可されている場合だけ設定します。

目標管理やチェックポイントは、目的、進捗、再開情報を保持するための仕組みです。それ自体は、待機中も分析を続ける理由にも、外部状態を繰り返し確認する仕組みにもなりません。待機と再開には実行環境の対応手段を使い、目標や状態記録は必要な情報の保持に限定します。

`back off when the workflow permits`は、実行環境が確認間隔を調整できる場合に限って頻度を下げる指示です。待機APIや固定スケジュールの契約を無視して独自の間隔を作ることは求めません。また、停止条件の確認、失敗の診断、依存関係の変更、不要になった処理の取消しは、成果を前進させる有用な作業に含まれます。

## Windows local file references

### 指示文

```md
## Windows local file references

- In Windows chat responses, reference local files with absolute drive-letter paths.
- For workspace files you edited or reviewed, prefer Markdown file links with `C:/...` targets when the links are likely to open in the editor. Apply the same rule to local text files under configured writable roots. Never use `/C:/...`.
- Do not link WindowsApps paths, executables, or other system-managed paths.
- Add line numbers only when they are already known and relevant.
```

### 日本語訳

> - Windows上のチャット回答でローカルファイルを参照するときは、ドライブ文字を含む絶対パスを使います。
> - 編集または確認したワークスペース内のファイルは、エディターで開ける可能性が高い場合、`C:/...`をリンク先とするMarkdownリンクを優先します。設定された書き込み可能範囲にあるローカルテキストファイルにも同じ規則を適用します。`/C:/...`は使用しません。
> - WindowsApps配下、実行ファイル、その他のシステム管理対象へのリンクは作りません。
> - 行番号は、すでに確認できており、参照に役立つ場合だけ付けます。

### 背景と理由

Windowsのローカルパスは、Unix形式の先頭スラッシュや相対パスへ誤変換されると、チャットから正しいファイルを開けません。ドライブ文字付きの絶対パスと`C:/...`形式のリンク先を明示することで、対象を一意にし、Codexアプリやエディターから開きやすくします。

`/C:/...`の禁止、WindowsAppsや実行ファイルをリンク対象から外す規則、確認済みの行番号だけを使う規則は、見かけ上リンクになっていても実際には開けない、編集対象ではない、または誤った位置へ誘導する問題を防ぎます。

### 現在の上位指示との関係

現在の開発者指示には、Windowsのローカルファイルをドライブ文字付きの絶対パスで示すこと、編集・確認したファイルを`C:/...`形式のMarkdownリンクにすること、WindowsAppsや実行ファイルをリンクしないことが含まれています。この点では、現在の`AGENTS.md`と大きく重なります。

`AGENTS.md`では、この形式をWindows環境で継続して使うユーザー側の表示規則として明示しています。

### 補足

すべてのパスをリンクにする必要はありません。ユーザーが開く対象として有用なファイルだけをリンクにし、単なる例示や実行ファイルの場所はインラインコードで示します。行番号は、検索や変更でずれる可能性があるため、未確認の番号を推測して付けません。

## File deletion under writable roots

### 指示文

```md
## File deletion under writable roots

- When deleting files under configured writable roots, prefer `apply_patch`; shell deletion may be blocked even when other file writes succeed.
```

### 日本語訳

> 設定された書き込み可能範囲にあるファイルを削除するときは、`apply_patch`を優先します。ほかのファイル書き込みが成功する場合でも、シェルによる削除だけが拒否されることがあるためです。

### 背景と理由

Windows版Codexのサンドボックスでは、同じ書き込み可能範囲に対する作成や更新が成功しても、PowerShellなどのシェル経由の削除が拒否される場合があります。この規則は、書き込み権限があることと、すべての削除経路が許可されることを同一視しないために置かれています。

`apply_patch`は削除対象を差分として明示できるため、対象範囲を確認しやすく、シェル削除より安定して処理できる場合があります。

### 現在の上位指示との関係

現在の開発者指示には、ローカルファイル編集で`apply_patch`を使うこと、削除前に対象と権限を確認すること、破壊的な操作を慎重に扱うことが含まれています。そのため、方法と安全性の原則は一部重なります。

一方、この指示は「書き込み可能範囲でもシェル削除だけが拒否される」というWindowsサンドボックスの実際の非対称性を明示しています。一般的な削除安全規則ではなく、ローカル環境で成功しやすい経路を選ぶ補足なので、残す意味があります。

### 補足

この指示は削除権限を広げません。ユーザーの依頼に削除が含まれるか、対象が正しいか、回復が困難ではないかという判断は、上位の権限・安全指示に従います。ディレクトリの再帰削除など、`apply_patch`が適さない操作へ無理に適用する規則でもありません。

## Line endings

### 指示文

```md
## Line endings

- Use LF (`\n`) for text files you create or modify.
- After the final text edit and before the final response, run `node "$HOME/.agents/scripts/check-lf.mjs" --fix -- <all text files changed in this task>` once, passing all and only those files. Skip the command if no text files were changed.
- If the command fails, address only the reported files and rerun it. If it normalized files, name them in the final response; if a failure remains, report it instead of claiming completion.
```

### 日本語訳

> - 作成または変更するテキストファイルにはLF（`\n`）を使います。
> - 最後のテキスト編集後、最終回答の前に、今回変更したすべてのテキストファイルだけを渡して、`node "$HOME/.agents/scripts/check-lf.mjs" --fix -- <all text files changed in this task>`を一度実行します。テキストファイルを変更していない場合は実行しません。
> - コマンドが失敗した場合は、報告されたファイルだけに対処して再実行します。ファイルが正規化された場合は最終回答でそのファイルを示し、未解決の失敗が残る場合は完了と断定せず報告します。

### 背景と理由

Windowsでは、ツールやエディターの設定によってCRLFが入り得ます。この指示は、作成・変更するテキストファイルをLFへ統一し、最終編集後の実ファイルを`check-lf.mjs`で検査することで、引き渡す状態の行末を確認します。

「最後に一度」「すべて、かつ変更したものだけ」という条件には、編集のたびに同じ検査を繰り返す無駄を避け、確認漏れと無関係なファイルの変更を同時に防ぐ役割があります。

### 現在の上位指示との関係

現在の開発者指示には、編集方法や検証の一般原則はありますが、すべてのテキストをLFへ統一することや、`check-lf.mjs`を実行する具体的な完了条件は含まれていません。このセクションは上位指示の重複ではなく、Windows環境で継続して適用する個人方針です。

### 補足

バイナリファイルや今回変更していないファイルは渡しません。コマンドを実行したという事実だけで完了とせず、失敗が解消されたか、正規化後のファイルが検査を通ったかを確認します。

この指示はホーム側の`AGENTS.md`にあるため、原則としてすべてのリポジトリへ適用されます。既存のCRLF方針やWindows固有ファイルの慣例がある場合もLFへ変更し、ホーム側の`check-lf.mjs`を検査手順として使うことを含む、意図的な個人方針です。

## Complete skill and reference loading

### 指示文

```md
## Complete skill and reference loading

- These rules apply only when reading a selected `SKILL.md` and the reference files required for the current task.
- Do not aggregate content from more than one such file into a single tool result. Metadata such as file names, sizes, and line counts may be collected in parallel.
- Read a file directly only when its size is safely below the current tool output limit. If the size is unknown or a complete read could approach the limit, inspect its size first and read it in bounded chunks from the start.
- A complete, untruncated whole-file result requires no separate line-range tracking. When a file is read in chunks or a result is truncated, verify that the retrieved ranges cover the file continuously through EOF.
- If any required skill or reference file remains incomplete, finish reading it before taking task actions that depend on that skill.
```

### 日本語訳

> - これらの規則は、選択した`SKILL.md`と、今回の作業に必要な参照ファイルを読む場合だけに適用します。
> - これらのファイルの本文を、複数まとめて一つのツール結果へ集約しません。ファイル名、サイズ、行数などのメタデータは並行して取得できます。
> - ファイルを直接全文取得するのは、そのサイズが現在のツール出力上限を十分に下回る場合だけにします。サイズが不明な場合や、全文が上限に近づく可能性がある場合は、先にサイズを確認し、先頭から上限内のまとまりに分けて読みます。
> - 途中で切れていない全文を一度に取得できた場合は、別途行範囲を追跡する必要はありません。分割して読んだ場合や結果が途中で切れた場合は、取得範囲が先頭からEOFまで連続していることを確認します。
> - 必要なスキルまたは参照ファイルの読込が完了していない場合は、そのスキルに依存する作業へ進む前に読込を完了します。

### 背景と理由

スキルの指示へ従うには、選択した`SKILL.md`と必要な参照ファイルを、途中で欠けていない状態で読む必要があります。ツール結果には出力上限があるため、複数の本文を一つの結果へ集約せず、サイズに応じて一括読込と分割読込を選びます。

2026年8月11日時点のCodexリポジトリでは、[`DEFAULT_MAX_OUTPUT_TOKENS`を10,000と定義](https://github.com/openai/codex/blob/main/codex-rs/core/src/unified_exec/mod.rs#L60-L68)し、[`max_output_tokens`が未指定ならその定数を使います](https://github.com/openai/codex/blob/main/codex-rs/core/src/unified_exec/mod.rs#L177-L179)。このセッションの`functions.exec`ツール契約も、直接返す結果の`max_output_tokens`を既定で10,000トークンとしています。この値は一回のツール結果に割り当てる出力予算であり、モデル自体の最大出力トークン数やファイルサイズの上限ではありません。

呼び出し時に別の値を指定でき、実装やツール契約の更新でも変わり得るため、`AGENTS.md`の指示文では数値を固定せず「現在のツール出力上限」としています。ファイルのバイト数とトークン数は一致せず、コマンドの付随出力も予算を使うため、上限に近づく可能性がある場合は分割して読みます。

### 現在の上位指示との関係

現在のスキル利用に関する開発者指示には、選択した`SKILL.md`を完全に読むこと、必要な参照を読み、結果が途中で切れたりページ分割されたりした場合はEOFまで続けることが含まれています。この点では、完全読込の目的は現在の上位指示にもあります。

一方、現在の`AGENTS.md`は、完全読込を実現するための具体的な失敗回避策を追加しています。とくに、複数本文を一結果へ集約しないこと、メタデータだけは並行取得できること、サイズを見て直接読込と分割読込を選ぶこと、分割範囲の連続性を確認することは、上位指示より具体的です。

### 補足

この規則は、関連しそうなスキルや参照をすべて読むことを求めません。今回選択したスキルと、そこから必要と判断した参照ファイルだけが対象です。

## 参考資料

- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Model guidance: Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
