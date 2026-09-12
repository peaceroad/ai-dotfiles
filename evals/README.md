# 評価記録

評価入力、判定条件、応答記録、評価対象のmanifestを保存します。プラグインは`evals/<plugin>/<skill>/`、グローバル指示は`evals/codex-agents/`にまとめます。評価の説明、採用判断、限界は`docs/`に置きます。

## グローバルAGENTS.md

[codex-agents/](codex-agents/README.md)に、待機、完全読み込み、LF、応答品質、ブラウザー指定、Windowsファイル参照の13ケースと試行準備スクリプトがあります。旧版・現行版をコミットとハッシュで固定し、机上試行と実環境試行を区別します。モデルの行動比較は未実行です。[評価方針と限界](../docs/notes/codex-agents-md-evaluation.md)を参照してください。

## agent-design-tools / prompt-design

記録は`agent-design-tools/prompt-design/`にあります。Codexで実施した試行の保存データであり、このディレクトリ自体が自動評価を実行するものではありません。

| 記録 | 入力と評価対象 |
| --- | --- |
| 初回の指示生成・レビューと下流試行 | [ケース](agent-design-tools/prompt-design/evaluation-cases.json)、[manifest](agent-design-tools/prompt-design/evaluation-manifest.json) |
| 根拠の保持に関する追加評価 | [原案・候補の比較ケース](agent-design-tools/prompt-design/source-preservation-cases.json)、[指示生成・下流ケース](agent-design-tools/prompt-design/source-preservation-skill-cases.json)、[manifest](agent-design-tools/prompt-design/source-preservation-manifest.json) |
| モデル別参照の構成レビュー | [GPT-5.6参照復元時のmanifest](agent-design-tools/prompt-design/model-reference-manifest.json)。静的レビューであり、新たな動作試行は含まない |
| Gemini参照の更新レビュー | [manifest](agent-design-tools/prompt-design/gemini-reference-manifest.json)、[変更内容と限界](../docs/prompt-design/gemini-reference-review.md)。公式資料との照合であり、新たな動作試行は含まない |
| Gemini全指示の再監査 | [manifestと復元用差分](agent-design-tools/prompt-design/gemini-instruction-audit-manifest.json)、[再監査の説明](../docs/prompt-design/gemini-reference-review.md#全指示の再監査)。指示の適用条件を静的に確認したもので、新たな動作試行は含まない |
| 数値設定の提案範囲の調整 | [manifestと復元用差分](agent-design-tools/prompt-design/numeric-settings-review-manifest.json)、[変更理由と確認範囲](../docs/prompt-design/README.md#数値設定を提案する範囲の調整)。静的な条件照合であり、新たな動作試行は含まない |

応答原文は同ディレクトリの`evidence/`に保存しています。確認した内容と限界は、[全体評価](../docs/prompt-design/README.md)、[根拠保持の追加評価](../docs/prompt-design/source-preservation-review.md)、[モデル別参照のレビュー](../docs/prompt-design/model-reference-review.md)を参照してください。

2026年9月12日のAstra公式ブログに基づく2スキルの再確認は、[ケースと判定条件](agent-design-tools/prompt-design/astra-blog-review-cases.json)、[応答と読込申告](agent-design-tools/prompt-design/evidence/2026-09-12-astra-blog-review.json)、[manifest](agent-design-tools/prompt-design/astra-blog-review-manifest.json)、[候補の復元用差分](agent-design-tools/prompt-design/astra-blog-review-instructions.patch)に保存しています。別文脈の候補版2件を確認したもので、新旧比較、通常環境での自動選択率、採点器の実測ではありません。応答の読込報告は構造化し、ローカル絶対パスを残さない形で記録しました。[変更理由と限界](../docs/prompt-design/astra-blog-review.md)も参照してください。

## agent-design-tools / agent-workflow-design

記録は`agent-design-tools/agent-workflow-design/`にあります。[5件の比較入力と継続イベント](agent-design-tools/agent-workflow-design/cases.json)、[判定条件](agent-design-tools/agent-workflow-design/criteria.json)、[追加の保守メモ入力](agent-design-tools/agent-workflow-design/fresh-cases.json)、[定性的な判定](agent-design-tools/agent-workflow-design/results.json)、[manifest](agent-design-tools/agent-workflow-design/manifest.json)を保存しています。

旧版・候補から生成した設計と、別の実行者による机上継続の応答は同ディレクトリの`evidence/`にあります。[保存ソース](agent-design-tools/agent-workflow-design/candidate-snapshots.json)から初回候補と最終候補を復元でき、旧版はmanifestの基点コミットで確認できます。実ランタイムの動作試験や統計的な性能比較ではありません。[改訂判断と評価の限界](../docs/agent-workflow-design/README.md)も参照してください。

使いやすさと冗長さの再監査では、[追加の比較入力](agent-design-tools/agent-workflow-design/second-review-cases.json)と[再監査manifest](agent-design-tools/agent-workflow-design/second-review-manifest.json)に、基準版・途中候補・修正候補の設計生成を記録しています。[再監査の判断と限界](../docs/agent-workflow-design/second-review.md)も参照してください。

2026年9月6日の[公開前確認](../docs/agent-workflow-design/publication-review.md)で、応答ファイルに残っていたローカル絶対パスを匿名化しました。過去のmanifestは維持し、[publication-manifest](agent-design-tools/agent-workflow-design/publication-manifest.json)に加工前後のハッシュと変更箇所を記録しています。

## パスと記録の保全

JSONの`path`はリポジトリルートからの相対パスです。manifestは評価時点の対象ファイルのSHA-256を記録し、直前のmanifestを参照するものにはそのサイズとハッシュも記録しています。後続の編集で作業ツリーと一致しなくなった場合も、評価対象のハッシュを最新値へ置き換えません。基点コミットやmanifest内の復元情報から、その評価時点の版を照合します。

機微情報の除去などで公開用の記録を加工するときは、変更内容と加工前後の対応を明示します。加工用のmanifestがあるファイルは、過去のハッシュを元記録として保ち、公開ファイルを加工後のハッシュで照合します。個人情報や秘密値そのものを、加工履歴やバックアップとして公開ディレクトリへ複製しません。

2026年9月6日に、評価データを`docs/prompt-design/`から`evals/agent-design-tools/prompt-design/`へ移設しました。ケースと応答の内容・ハッシュ、評価対象指示のハッシュは維持し、3つのmanifestの記録パスと参照先manifestのサイズ・ハッシュを更新しています。応答原文に含まれる旧ディレクトリ名は試行当時の記録として残しています。
