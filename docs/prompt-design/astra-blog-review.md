# Astra公式ブログに基づく設計スキルの再確認

2026年9月12日。`prompt-design`と`agent-workflow-design`を、[Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)、公式モデルガイド、既存参照が挙げる外部資料と照合しました。基本構成を維持し、評価と発見性をレビューするための参照を補強しています。

今回の採用は、Codexが必要な判断材料を読み、利用者が使える修正や設計を返すための保守判断です。少数の限定確認を行いましたが、旧版に対する性能向上や一般的な最適性を実証したものではありません。

## 維持する構成

OpenAI／Codex向けで設計対象が未確定なら、Astraを既定とします。Astraが明示または既定で選ばれた場合は、小さな文言改善でも`prompt-design/SKILL.md`とAstra用参照を読みます。既存の利用先や明示された別モデルは保持します。

小さな変更にも、指示の強さ、確認の要否、出力の詳しさなどのモデルに関係する判断が含まれます。変更量だけを理由にAstra参照を省く案は採用しません。共通本文は設計方法と報告方針を、Astra参照は対象モデルの調整観点を担当します。

局所修正を「修正前／修正後／理由」で示す例は、`SKILL.md`に残します。修正の対応を判断しやすくするための選択肢であり、別ファイルへ移して共通本文から見えなくする必要はありません。全面改訂では完成したプロンプトと主な理由を返し、記事などの生成先へ報告形式を強制しない既存条件も維持します。

API、詳細診断、description、状態・復帰などの参照は、それぞれの適用条件で選びます。両スキルの`SKILL.md`、description、UIメタデータは変更していません。日常の作業へ一律の評価工程や承認待ちを追加していません。

## 今回の変更

- [プロンプトの詳細チェックリスト](../../plugins/agent-design-tools/skills/prompt-design/references/prompt-review-checklist.md)では、スキル選択や参照読み込みが結果に関わる場合に、実際に届いた指示を評価する観点を追加しました。生成した指示だけでなく、利用者が変更を判断し、その指示を使えるかも確認します。
- [description用の参照](../../plugins/agent-design-tools/skills/prompt-design/references/skill-description-review.md)では、利用できるカタログの証拠から、重要な条件の表示、省略、近隣スキルとの区別を確認します。文字数だけで発見性を推定せず、一覧を確認できなかった場合は未確認と報告します。
- [状態・証拠・復帰の参照](../../plugins/agent-design-tools/skills/agent-workflow-design/references/state-evidence-and-recovery.md#evidence-and-evaluation)では、モデルの点数を採否や反復改善に使う場合の校正を補いました。独立して確認した例や実際の成果と採点を照合し、必要に応じて担当者の好みや提示順・文章量の偏りも確認します。

Astra参照と状態・証拠の参照の確認日を更新しました。[プラグインのREADME](../../plugins/agent-design-tools/README.md#reference-selection)には、小さなAstra向け修正での読み方と報告方針を明記し、今回のブログを背景資料に加えました。モデル採点の条件は状態・証拠の参照を正本とし、各所に評価手順を複製していません。

## 外部出典との照合

最初のレビューではローカル参照を確認していましたが、そこに挙がる外部ページの確認は一部に限られていました。追加レビューで本文と関連仕様まで照合しました。外部リンクは通常作業の一律の必読一覧ではありませんが、今回は出典を確かめる依頼自体が作業範囲です。

- [Astra公式ブログ](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)と[Astraモデルガイド](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)は、成果・制約を明確にし、必要な参照と具体的な出力要件を残す判断に使いました。段階的な読み込みや旧手順の再検討を、必要なAstra参照の省略や出力契約の削除とは解釈していません。
- [GPT-5.6モデルガイド](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)と対象モデルのページも照合しました。GPT-5.6向けの参照条件を、Astraへ一律に移す必要はありません。
- [API・ランタイム参照](../../plugins/agent-design-tools/skills/prompt-design/references/openai-tools-and-runtime.md)が挙げるツール検索、PTC、非同期実行、Multi-agent、steering、推論状態、compaction、キャッシュ、停止条件の関連仕様を確認しました。設計判断に関わる記述の不整合は見つからず、API参照は維持しました。SDKサンプルや外部操作の実行試験ではありません。
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)と[Macro Evals](https://developers.openai.com/cookbook/examples/partners/macro_evals_for_agentic_systems/macro_evals_for_agentic_systems)は、成果と実行証拠の評価、採点基準の校正の根拠に使いました。[Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)も、フィードバックから作った評価が望む行動を測るか確認する例として照合しました。
- [開発ワークフローのCookbook](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)と[Anthropicのハーネス設計事例](https://www.anthropic.com/engineering/harness-design-long-running-apps)は、手順や評価器が支える品質を見て構成を選ぶ参考です。各事例の承認、ファイル構成、反復回数は、全作業の必須条件にはしていません。

既存の出典一覧にあるCodexの基盤・反復作業、実行単位の予算管理、Warp、auto mode、研究加速の資料も、担当層と根拠の範囲を確認するために参照しました。別モデルや別製品の事例をAstraの実証結果として扱う変更はありません。

## 評価する範囲

スキル評価では、変更と用途に応じて次の段階を区別します。全項目を毎回実施する固定手順ではありません。

1. 必要なスキルと対象モデルの参照へ到達したか。スキルを指定した試行と、実際のカタログから選んだ試行を区別します。
2. 提案された変更を利用者が判断でき、完成した指示や設計を使えるか。ラベルの文字列ではなく、変更と理由の対応、意図・制約・出力契約の保持を確認します。
3. 生成物を使う後続の実行が、意図した成果に達するか。設計案、机上の状態遷移、実ランタイムでの成功を分けます。
4. 採点を採否に使う場合、その採点が既知の判断例や成果と合っているか。評価器を別文脈に分けたことだけで信頼性を保証しません。

必要な参照を読んだかは成功条件の一部です。ファイル数や文字数の最小化を目的にせず、正しさと使いやすさを保ったうえで、不要な読み込みや待ち時間を評価します。

## 限定した動作確認

[B01・B02の依頼と判定条件](../../evals/agent-design-tools/prompt-design/astra-blog-review-cases.json)を先に固定し、過去の会話を引き継がない別々のサブエージェントへ1件ずつ渡しました。スキル名は指定せず、利用可能なものから選ぶよう依頼しました。過去の評価、判定条件、今回の変更理由、期待する回答は渡していません。回答と読み込んだ資料の申告を求め、ファイル更新や例示ワークフローの実行は許可していません。

- **B01：対象モデル未指定の短いプロンプト修正。** 記事だけを根拠にする要件、300字程度という目安、完成した要約を一度で返す要件と矛盾する指示を修正しました。完成文を先に返し、3つの変更理由を簡潔に説明しています。`prompt-design/SKILL.md`とAstra参照を読んだと申告し、要約そのものや余分なワークフローは作りませんでした。「修正前／修正後／理由」というラベルを使った試行ではなく、完成文と変更説明の使いやすさを確認したものです。
- **B02：点数で候補を自動採用する改善ループのレビュー。** 資料への忠実さと300字程度という要件に対し、詳しい回答を高く評価する採点基準の不一致を診断しました。確認済み3件と未確認9件を分け、校正、順序の偏りの確認、根拠の保存、評価器の変更と候補採用の分離を提案しています。順序が逆転の原因だとは断定せず、毎回の人の承認や任意の修正回数上限も追加しませんでした。

主担当は保存した判定条件に照らし、この2件で意図・範囲・成果を保てたと判断しました。[応答と読込申告](../../evals/agent-design-tools/prompt-design/evidence/2026-09-12-astra-blog-review.json)と[対象版・確認結果](../../evals/agent-design-tools/prompt-design/astra-blog-review-manifest.json)を保存しています。

読み込んだ資料は実行担当の申告です。スキル一覧が提示されたとの申告もありますが、通常のCodex UI全体での自動選択率、カタログの網羅性、内部の読み込み処理を測ったものではありません。モデルと推論設定は親セッションを継承し、実効effort、トークン数、待ち時間は計測していません。

## 検証と採用の限界

両スキルの`quick_validate.py`、`npm run check:plugins`の5テストが成功しました。Windows既定の文字コードでは`prompt-design`の検証が読込エラーになったため、PythonのUTF-8モードで実行し直しています。スキルや検証スクリプトをこのために変更していません。

候補の15ファイル、保存したケース・応答のハッシュ、更新した文書のローカルリンクも照合しました。今回の変更ファイルはUTF-8・LFで保存し、公開対象にローカルの個人パスが残っていないことを確認しています。

今回の2件は候補版だけの限定確認です。旧版との比較や反復測定はなく、追加した文だけが良い回答の原因とは言えません。自動選択、長期実行、APIの効果、採点器自体の精度の実測は引き続き未確認です。descriptionの欠落や切り詰めによる不具合も観測していないため、説明文そのものを短縮する改訂はしていません。

過去のmanifest、保存版、応答は維持しています。旧ノートの当時の件数やサイズを最新値へ書き換えず、今回の判断へ辿れる案内と、必要な参照を保持する評価方針を更新しました。ローカルのスキルリンクはリポジトリの正本を参照しているため、今回の参照更新がそのまま利用されます。

## コミット後の記録整理

評価対象の15ファイルは[コミットb37d23c](https://github.com/peaceroad/ai-dotfiles/commit/b37d23c8af864f695e10370bb1cacd212158a4dc)から同じハッシュで取得できるため、未コミット候補を復元するために保存したパッチは削除しました。manifestの復元案内をこのコミットの参照に切り替え、評価時のファイルハッシュ、ケース、応答、判定は保持しています。

`state-evidence-and-recovery.md`と`loop-patterns-and-control.md`では、実行判断に使わない汎用的な`Reviewed`の日付を外しました。出典リンク、対象モデル・ランタイムを区別する指示、評価や制御の規則は維持しています。外部仕様の確認時点を示す`Official guidance checked`などの日付と、評価記録の日付は残しています。この整理後の参照と評価時の版は区別し、今回の2件を整理後の再試験とは扱いません。
