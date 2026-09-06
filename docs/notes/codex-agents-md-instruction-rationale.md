# `~/.codex/AGENTS.md`の指示と設計理由

このノートは、2026年9月6日にGPT-6 Astra向けに見直した共通指示と、その設計理由を説明します。回答の好みと環境上の約束を残し、待機の適用条件と、指示ファイルを完全に読むための条件を整理しました。

英語本文は、ホーム側から書き出した[公開用のAGENTS.md](../../home/.codex/AGENTS.md)で確認できます。更新時のコピー方向と検査方法は、[エクスポート手順](../export.md#使い方)を参照してください。

## 共通指示に置く内容

`~/.codex/AGENTS.md`には、複数の作業で継続したい利用者の好みと、環境固有の約束を置きます。プロジェクト固有の手順や専門分野の編集基準は、それぞれの`AGENTS.md`やスキルで管理します。

Codexはグローバルな指示にプロジェクト側の指示を重ね、同じ指示チェーンでは作業ディレクトリに近い指示が先の指示を上書きできます。グローバルな指示の配置と探索順は、[OpenAIのAGENTS.mdガイド](https://learn.chatgpt.com/docs/agent-configuration/agents-md)に従います。ファイル名によってシステム指示、開発者指示、実行環境の権限を上書きできるわけではありません。

設計理由を更新するときは、過去に上位指示と重複していたかだけで採否を決めません。現在の適用範囲、利用者が保ちたい選択、実際の失敗やツール制限を確認します。上位指示はアプリや実行モードによって変わり得るため、このノートへ原文を複製せず、設計に必要な関係だけを説明します。

## Astra向けに見直した点

[OpenAIのAstraガイダンス](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)は、指示ファイルへの敏感さ、確認質問による進行の中断、回答の詳しさや検証量などを調整対象に挙げています。これらは一般的な傾向であり、この共通指示による不具合を実証するものではありません。

今回の改稿では、日常の選択はモデルに任せ、利用者の意図やツールの制約によって判断が変わる箇所を具体化しました。自律実行、サブエージェント、テストなどの推奨文を一式追加することは避けています。

| 項目 | 改稿での扱い | 判断理由 |
| --- | --- | --- |
| 回答品質 | 維持し、表の使用方針を追加 | 必要な説明と根拠関係を保ち、チャットでは理解を助ける場合や明示的な依頼がある場合に表を使う |
| 待機 | 適用条件を整理 | 実行中の独立作業、処理完了までの待機、ターンをまたぐ監視を分ける |
| Chrome優先 | 維持 | 外部ブラウザを使う場合だけの短い選択方針として成立している |
| Windowsのファイル参照 | 書式を1行で指定 | ドライブ文字付きの絶対パスと、先頭スラッシュを付けない条件を残す |
| LF | 保存方針だけを残す | 検査スクリプトの毎回の実行を完了条件から外す |
| スキルと参照の読み込み | 出力制限を具体化 | 内側の読み込みと外側の結果集約の両方で、途中切れを防ぐ |
| 削除方法 | `apply_patch`優先の指定を削除 | 過去の環境上の回避策を、すべての削除に適用する共通指示から外す |

## Response quality

必要な文脈、理由、根拠、注意点を保ちながら、本文ですでに明確になった内容を末尾の結論や要約で繰り返さないための指示です。チャットで表を使う条件もここに置きます。

```md
## Response quality

- Provide the context, supporting explanation, and caveats needed for the user to understand the answer. Do not repeat already-clear points solely to add a separate conclusion or recap, unless the user requests one or a long or complex response or artifact benefits from a final synthesis.
- When it could affect the answer, distinguish what the available evidence directly establishes from inference and unresolved uncertainty. Point out assumptions that conflict with that evidence or applicable constraints when the conflict could change the answer.
- In chat responses, use tables only when they clearly improve understanding or I explicitly request one. Prefer prose or lists over simple two-column tables.
```

第1項は、回答全体を一律に短くする規則ではありません。利用者が求めた要約や、長く複雑な成果物で理解を助ける最終整理は残せます。

第2項では、ファイル、ログ、ソース、実行結果などから直接確認できることと、推論、未解消の不確実性を区別します。区別や前提の矛盾が回答へ影響する場合だけ説明するため、すべての回答に「事実」「推論」といった見出しを付ける必要はありません。

第3項はチャットの回答に限定した表示上の好みです。表が理解を明確に助ける場合、または利用者が表を明示的に求めた場合に使います。項目と説明を並べるだけの単純な2列表では、文章やリストを優先します。2列を一律に禁止する規則でも、3列以上なら表を使う規則でもありません。作成を依頼された文書やスプレッドシートには一律に適用しません。

この項目は、Astraで表が増えるという傾向を実証した結果ではなく、利用者の読みやすさの好みとして追加しました。表を使う条件と単純な2列表への好みを2文に分け、後から適用範囲を確認しやすくしています。[評価方針](codex-agents-md-evaluation.md#チャットの表の使用方針)に従い、今回は評価ケースの追加・実行を行わず、普段の回答で適用の過不足を確認します。

## Waiting

実行中の処理を待つ間も、依存関係と対象の版が許すなら独立した作業を進めます。進められる仕事がなくなった時点で、実行環境の待機手段を使います。

```md
## Waiting

- While operations are running, advance useful independent work and use partial results when dependencies and version constraints allow. Wait for a complete set only when the task requires it.
- If nothing useful can proceed until an operation completes, use the runtime's supported wait mechanism. Do not fill the wait with speculative analysis, repeated replanning, unchanged status updates, or repeated polling. Investigate evidence of a stall or changed dependency when it affects completion.
- For authorized monitoring across turns, use a supported monitoring mechanism and yield. Preserve only the state needed to resume in runtime-owned state or an already-authorized project location. On resumption, check current state before acting; if nothing actionable changed, return to waiting, back off when supported, and stop recurring monitoring when the task ends.
```

第1項は、先に得られた部分結果を使える場合と、比較や統合のために全結果が必要な場合を分けます。同じ版への複数のレビューなど、先に対象を変更すると後続の結果が古くなる作業では、版の制約を優先します。

第2項は、結果が返るまでの空白を推測的な分析、再計画、無変化の進捗説明、繰り返しのポーリングで埋めることを防ぎます。停滞や依存関係の変化を示す証拠があれば、完了に関わる問題として調べられます。通常の調査や試行全般に停止条件を課す書き方は避けました。

第3項は、許可された継続監視に適用します。再開に必要な状態だけを実行環境または許可済みのプロジェクト内へ残し、再開時に現在の状態を確認します。行動につながる変化がなければ待機へ戻り、対応する仕組みがある場合は確認間隔を延ばします。タスクが終わったら定期監視も停止します。サブエージェントの起動、定期監視、状態ファイルの作成に新たな権限を与える規則ではありません。

## Browser

外部ブラウザが必要で、利用者から指定がない場合はChromeを優先します。

```md
## Browser

- When using an external browser, prefer Chrome unless I specify a browser.
```

内蔵ブラウザと外部ブラウザのどちらを使うかは固定しません。別のブラウザへの切り替えも禁止せず、現在の依頼での指定を優先します。配置の理由は、[Codex Browserの設定と安全性](codex-browser-config-and-security.md#ブラウザの選択とagentsmd)で説明しています。

## Windows local file references

Windows上でローカルファイルを示す際、利用者が開くと役立つファイルにはドライブ文字付きの絶対パスでリンクします。

```md
## Windows local file references

- In Windows responses, link useful local files with absolute drive-letter paths such as `C:/...`, without a leading slash.
```

`C:/...`のようなドライブ文字付きパスを使い、`/C:/...`のような先頭スラッシュを付けない形式を残しました。

WindowsAppsや実行ファイルを一律にリンク対象から除外する規則と、行番号に関する独立した規則は外しました。対象や参照位置を正しく示すという一般的な要件に任せ、共通指示にはWindows固有の書式だけを残しています。

## Line endings

作成・編集するテキストファイルはLFで保存します。

```md
## Line endings

- Use LF (`\n`) for text files you create or modify.
```

保存後に`check-lf.mjs`を毎回実行する義務と、正規化したファイル名を最終回答へ記載する義務は外しました。LFで保存する責任は残し、改行変換や混在が疑われる場合には、状況に応じて確認方法を選びます。

[検査スクリプト](../../home/.agents/scripts/check-lf.mjs)は任意の確認・正規化手段として残しています。これを毎回実行する場合と同じ機械的な保証を、1行の保存方針だけで得られるわけではありません。

LFは利用者の共通方針ですが、プロジェクト側の適用される明示指示との競合は、Codexの指示階層と探索順で解決します。既存ファイルがCRLFであることと、適用される指示がCRLFを要求することは区別します。

## Complete skill and reference loading

選択したスキルと、今回の作業に必要な参照は、依存する作業へ進む前に完全に読みます。この節は、関連しそうなファイルをすべて読む規則ではありません。

```md
## Complete skill and reference loading

- Read each selected `SKILL.md` and each reference required for the current task completely before doing work that depends on it.
- Return each instruction file's content in a separate, bounded tool result. Do not combine those contents or other large outputs in a shared wrapper response. Metadata may be collected together.
- Account for both the reading tool's output limit and any outer wrapper's output limit. Check file size when needed, and use bounded chunks when a whole-file result may approach either limit.
- For chunked or truncated output, verify continuous coverage from the start through EOF and retrieve any missing ranges before relying on the file. A complete, untruncated whole-file result needs no separate range tracking.
```

2026年9月6日に確認した編集環境では、ファイルを読む`exec_command`と、その結果をまとめて返す`functions.exec`の両方に出力予算があり、既定はいずれも10,000トークンでした。これは呼び出し時に指定できるツール出力の予算で、モデルのコンテキスト容量とは別です。この調査でも、複数の結果をまとめた返却が途中で切れ、必要なファイルを分けて読み直しました。

内側の読み込みが上限内でも、外側で本文を再集約すると欠ける可能性があります。そのため、指示本文は1つのツール結果につき1つのファイルとし、外側でも複数本文や大量の別結果をまとめません。ファイル名、サイズ、行数などの小さなメタデータはまとめて取得できます。

ファイルが1つでも、出力上限に近づく可能性があれば分割します。バイト数、行数、トークン数は一致せず、長い行を含むファイルでは行数だけで小さいと判断できません。必要に応じてサイズを調べ、内側と外側の両方に余裕を持つ取得範囲を選びます。指示本文では、更新され得る出力上限の数値を固定しません。

分割または途中切れがあった場合は、先頭からEOFまで欠けずに取得できたかを確認します。欠けた範囲を取得してから、その指示を使います。途中切れのない全文を一度に取得できた場合には、行範囲の追跡を別作業として追加しません。

## 削除方法の指定を外した理由

以前は、書き込み可能な範囲でもシェル経由の削除だけが拒否されたというWindowsサンドボックスの挙動を理由に、`apply_patch`を優先していました。

現在の環境で同じ削除の問題が続いているかは未確認です。モデルの更新だけでは、サンドボックスの制約が変わったとは判断できません。

改稿では、対象に適した削除方法を選ぶ判断をツールと通常の作業方針へ戻しました。権限や削除対象の確認は引き続き適用されます。過去の回避策はこのノートへ残し、同じ症状が再発した場合に再検討できるようにしています。

## Codex指示キャッシュとの照合

改稿後の2026年9月6日に、ローカルの`~/.codex/models_cache.json`にある`gpt-6-astra`の指示を追加で照合しました。対象キャッシュの取得時刻は`2026-09-06T05:12:12.168007Z`（日本時間14:12）、`client_version`は`0.153.0`です。中核の`model_messages.instructions_template`、継続実行用の`persistent_instructions`、`collaboration_modes.default`をそれぞれ全文確認しました。

キャッシュは更新され得るため、後日の確認では対象モデル、取得時刻、クライアント版を確認し、必要な本文を読み直します。原文はこのリポジトリへ複製せず、今回の判断に関わる関係を記録します。

- 表については、対応関係や比較に表を使う方針と、短い文章やリストで十分明確な場合は可視化を省く方針がありました。チャットでの表の必要性と単純な2列表への好みを具体化する判断を維持します。Astraで実際に表が増える傾向を実証したものではありません。
- 読み込みについては、独立した読み取りをまとめて実行する一般方針がありました。内側・外側の出力上限を踏まえて指示ファイルを完全に取得する条件までは明記されていないため、実際の取得漏れに基づく共通指示を維持します。
- LF保存、Windowsのドライブ文字付きリンク、削除時の`apply_patch`優先は、中核本文には指定されていませんでした。前二者を環境上の約束として残し、削除方法の固定を外した判断を維持します。本文に指定がないことは、実行環境の制約がないことを意味しません。

確認対象はキャッシュされたCodex向けテンプレートであり、実行時に追加される指示を含む全構成ではありません。モード別の指示は、キャッシュに存在するだけで有効とは判断しません。この照合は文面上の確認であり、AGENTS.mdの有無による動作比較や性能評価は行っていません。

## 確認範囲

改稿の根拠は、利用者と合意した方針、旧版の設計理由、確認済みの公式資料、今回のツール出力です。改稿後には上記のCodex指示キャッシュも照合しました。旧版との文面比較や文書の整合性確認は、実タスクでの性能改善を保証しません。

今後の利用では、待機中に有用な作業だけを進めること、指示ファイルを欠けずに読むこと、編集ファイルをLFで保存すること、Windowsのファイルリンクが開けることを確認します。
