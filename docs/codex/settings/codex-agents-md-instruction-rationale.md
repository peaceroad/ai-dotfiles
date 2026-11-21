# `~/.codex/AGENTS.md`の指示と設計理由

`~/.codex/AGENTS.md`には、プロジェクトをまたいで適用する回答の好み、待機の判断基準、ファイルを扱う際の約束を置きます。以下に現行の6節を適用順に掲載し、それぞれに日本語訳と設計理由を添えます。英語本文の公開用コピーと、その更新手順はこちらです。[公開用のAGENTS.md](../../../home/.codex/AGENTS.md)・[エクスポート手順](../../export.md#使い方)

Codexはグローバルな指示に、作業ディレクトリまでのプロジェクト指示を順に重ねます。プロジェクト固有の約束はその場所の`AGENTS.md`に、専門作業の手順は該当スキルに置けます。GPT-6.2 Astra向けの公式ガイドも、共通の指示を短く保つ方針を示しています。ここでは作業を横断して必要な判断を英文に残し、具体例や実装の出典はこの解説に置いています。[AGENTS.mdの探索順](https://learn.chatgpt.com/docs/agent-configuration/agents-md)・[GPT-6.2 Astraのプロンプトガイド](https://learn.chatgpt.com/guides/prompting-gpt-6-2-astra#keep-your-agentsmd-lean)

## Response quality

```md
## Response quality

- Provide the context, supporting explanation, and caveats needed for the user to understand the answer. Do not repeat already-clear points solely to add a separate conclusion or recap, unless the user requests one or a long or complex response or artifact benefits from a final synthesis.
- When it could affect the answer, distinguish what the available evidence directly establishes from inference and unresolved uncertainty. Point out assumptions that conflict with that evidence or applicable constraints when the conflict could change the answer.
- In chat responses, use tables only when they clearly improve understanding or I explicitly request one. Prefer prose or lists over simple two-column tables.
```

> **日本語訳：回答品質**
>
> - 利用者が回答を理解するために必要な文脈、補足説明、留意点を示す。独立した結論や要約を付けるためだけに、すでに明確な内容を繰り返さない。ただし、利用者が結論や要約を求めた場合は除く。回答や成果物が長い場合や複雑な場合も、末尾の整理が役立つなら付けてよい。
> - 回答に影響する場合は、得られている証拠から直接確認できることと、推論、未解消の不確実性を区別する。前提がその証拠や適用される制約と矛盾し、その矛盾によって回答が変わり得る場合は指摘する。
> - チャットの回答では、理解を明確に助ける場合、または利用者が表を明示的に求めた場合にのみ表を使う。単純な2列の表より、文章やリストを優先する。

第1項は、読者が判断に必要とする詳しさを基準にします。たとえば短い確認には理由を一言添えれば足りますが、複数案の比較では、最後に選択条件をまとめる価値があります。第2項が効くのは、根拠の種類で結論が変わる場面です。ソースで既定値を確認した場合、その値が実際の呼び出しでも使われたかは、呼び出し側の引数を見て判断します。

第3項はチャットの読みやすさに関する利用者の好みです。説明を縦に読むだけなら文章や箇条書きが適し、複数の候補を同じ条件で見比べるなら表が役立ちます。列数で機械的に決めず、依頼された成果物にはその成果物の書式を適用します。[表の使用方針と評価範囲](codex-agents-md-evaluation.md#チャットの表の使用方針)

## Waiting

```md
## Waiting

- While operations are running, advance useful independent work and use partial results when dependencies and version constraints allow. Wait for a complete set only when the task requires it.
- If nothing useful can proceed until an operation completes, use the runtime's supported wait mechanism. Do not fill the wait with speculative analysis, repeated replanning, unchanged status updates, or repeated polling. Investigate evidence of a stall or changed dependency when it affects completion.
- For authorized monitoring across turns, use a supported monitoring mechanism and yield. Preserve only the state needed to resume in runtime-owned state or an already-authorized project location. On resumption, check current state before acting; if nothing actionable changed, return to waiting, back off when supported, and stop recurring monitoring when the task ends.
```

> **日本語訳：待機**
>
> - 処理の実行中は、役立つ独立した作業を進め、依存関係や版の制約が許す場合には部分結果を使う。全結果を待つのは、その作業で全結果が必要な場合に限る。
> - 処理が終わるまで有用な作業を進められない場合は、実行環境が提供する待機手段を使う。待ち時間を、推測的な分析、繰り返しの再計画、変化のない状況報告、繰り返しのポーリングで埋めない。停滞や依存関係の変化を示す証拠が作業の完了に関わる場合は調べる。
> - ターンをまたぐ監視が許可されている場合は、利用可能な監視手段を使い、制御を返す。再開に必要な状態だけを、実行環境が管理する状態領域か、すでに許可されたプロジェクト内の場所へ保存する。再開時は行動前に現在の状態を確認する。行動につながる変化がなければ待機へ戻り、対応している場合は監視の間隔を延ばす。作業が終わったら継続的な監視を停止する。

第1項の判断基準は、待っている結果と次の作業の依存関係です。同じ版を複数の担当者がレビューしている間にも、先に届いた指摘の根拠は調べられます。対象を書き換えると残りのレビューと版がずれる場合は、修正を待ちます。

第2項は、次に進める仕事が尽きた時点で効きます。完了通知を待てるなら、その仕組みに制御を渡します。処理の失敗や依存先の変更を示す情報が届いたときは、その情報をもとに調べます。

第3項の前提は、ターンをまたぐ監視がすでに許可されていることです。再開時には保存した最小限の状態を手掛かりに現状を確認し、終了条件に達したら監視も終えます。この節が定めるのは進行中の仕事の扱いです。サブエージェントを起動できる条件や委任先モデルの選択は、委任に適用される指示と設定で決まります。[サブエージェントの利用条件と待機](codex-subagent-runtime.md)

## Browser

```md
## Browser

- When using an external browser, prefer Chrome unless I specify a browser.
```

> **日本語訳：ブラウザ**
>
> - 外部ブラウザを使う場合は、利用者が別のブラウザを指定しない限り、Chromeを優先する。

ブラウザの選択を任されたときに、外部ブラウザの候補の中からChromeを優先するための指示です。内蔵ブラウザを使う作業はそのまま進められ、利用者が別のブラウザを指定した場合はその指定が優先されます。[ブラウザの選択とAGENTS.md](codex-browser-config-and-security.md#ブラウザの選択とagentsmd)

## Windows local file references

```md
## Windows local file references

- In Windows responses, link useful local files with absolute drive-letter paths such as `C:/...`, without a leading slash.
```

> **日本語訳：Windowsのローカルファイル参照**
>
> - Windowsでの回答では、利用者が開くと役立つローカルファイルに、`C:/...`のようなドライブ文字付きの絶対パスでリンクする。パスの先頭にスラッシュを付けない。

回答から対象ファイルを直接開けるように、リンク先の書式を揃えます。たとえばWindows上のファイルを案内するなら、リンク先は `C:/project/README.md` と書きます。リポジトリに保存して他の環境でも読む文書では、文書間のリンクにリポジトリ内の相対パスを使えます。

## Line endings

```md
## Line endings

- Use LF (`\n`) for text files you create or modify.
```

> **日本語訳：改行コード**
>
> - 作成または変更するテキストファイルには、LF（`\n`）を使う。

複数の編集手段を使っても保存結果が揃うように、作成・変更するテキストの改行を指定しています。改行の混在や自動変換が疑われるときは保存結果を検査できます。プロジェクトが特定のファイルに別の改行を明示している場合は、そのファイルに適用される指示を確認します。[LF検査スクリプト](../../../home/.agents/scripts/check-lf.mjs)

## Complete skill and reference loading

```md
## Complete skill and reference loading

- Read each selected `SKILL.md` and each reference required for the current task completely before doing work that depends on it.
- Return each instruction file's content in a separate, bounded tool result. Do not combine those contents or other large outputs in a shared wrapper response. Metadata may be collected together.
- Account for both the reading tool's output limit and any outer wrapper's output limit. Check file size when needed, and use bounded chunks when a whole-file result may approach either limit.
- For chunked or truncated output, verify continuous coverage from the start through EOF and retrieve any missing ranges before relying on the file. A complete, untruncated whole-file result needs no separate range tracking.
```

> **日本語訳：スキルと参照の完全な読み込み**
>
> - 選択した各`SKILL.md`と、今回の作業に必要な各参照を、その内容に依存する作業へ進む前に全文読む。
> - 各指示ファイルの内容は、出力上限に収まる個別のツール結果として返す。共通のラッパー応答に、複数の指示本文や他の大量の出力をまとめない。メタデータはまとめて取得してよい。
> - 読み取りツールと外側のラッパーの両方の出力上限を考慮する。必要に応じてファイルサイズを調べ、全文を一度に返すといずれかの上限に近づく可能性がある場合は、上限に収まる単位に分割する。
> - 分割して取得した場合や出力が途中で切れた場合は、先頭からファイル末尾（EOF）まで連続して取得できたことを確かめ、不足する範囲を取得してから、そのファイルに基づいて作業する。全文が途中で切れずに一度に返った場合は、別途取得範囲を管理する必要はない。

**GPT-6.2 Astraでも維持する理由**は、モデルが読めるコンテキストの広さにかかわらず、ツールが返す段階で指示の一部が省略され得るためです。たとえば、冒頭の手順と末尾の例が見えていても、中ほどにある適用条件が届いていなければ、その手順を正しく使う根拠が欠けます。

2026年11月21日に確認したOpenAIのCodex公開リポジトリのコミットは [`66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c`](https://github.com/openai/codex/commit/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c) です。この版では、次の3点が読み方の判断に関わります。

- **モデル向けの指示。** GPT-6.2 Astra向けの指示は、独立した検索や読み取りを1回の `functions.exec` で並行実行し、各結果を確認するよう促しています。並行実行と、複数の長い本文を同じ出力枠でモデルに渡すことは別の判断です。名前やサイズの取得はまとめられますが、必要な指示本文はファイルごとに出力枠を分けます。[モデル定義](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/models-manager/models.json#L258)
- **内側の出力上限。** ファイルを読むために使う `exec_command` の既定の出力予算は10,000トークンです。プロセスが正常終了しても、返される本文には出力制限が適用されます。[既定値](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/core/src/unified_exec/mod.rs#L74)・[既定値の適用](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/core/src/unified_exec/mod.rs#L218)・[出力の切り詰め](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/core/src/unified_exec/output.rs#L40)
- **外側の出力上限。** 内側の読み取りがそれぞれ収まっても、`functions.exec` からモデルに返す結果には別の出力予算があります。この版の既定はこちらも10,000トークンです。複数の完全な本文をまとめると、外側で一部が省略され得ます。[外側の既定値](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/code-mode-protocol/src/runtime.rs#L17)・[結果を予算内に収める処理](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/code-mode-runtime/src/output/output_render.rs#L62)・[対応するテスト](https://github.com/openai/codex/blob/66618f0512ccd43ebd9784f3f0af3f9e93ca6d0c/codex-rs/code-mode-runtime/src/output/output_render_tests.rs#L24)

このため第1項では、読み切る対象を「選んだスキル」と「今回必要な参照」に絞っています。第2・第3項では、長い本文を他の出力と混ぜず、一つのファイルでも上限に近ければ分割します。実際の上限は呼び出し方や実装によって変わるので、英語の指示には固定値を入れていません。

第4項の確認は、分割したときと途中が省略されたときに行います。たとえば1〜80行目の次に101行目以降が返ったなら、末尾が見えていても81〜100行目を回収してから先に進みます。全文が一度に届けば、そのまま作業に使えます。上記のソースが裏付けるのは出力が欠け得る仕組みまでです。この指示を置くことでGPT-6.2 Astraの実タスクの成功率がどれだけ変わるかは未測定です。
