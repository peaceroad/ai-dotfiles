# Gemini 4再構築版の前向き試行

この記録は入口を整理する前の版に対する試行である。当時の入口本文は[後続評価の変更前スナップショット](../gemini-usability/versions/before.txt)に保存されており、`source-snapshot.json`の入口ハッシュと一致する。後続の判定でこの試行結果を書き換えない。

## 条件と限界

保守目的は、Appsと画像の参照を組み合わせる設計と、Antigravityの通常のタスク指示を実行制御の設計へ拡大しない境界の確認。入力は[cases.json](cases.json)の`apps-image-author`と`antigravity-task`で、実在する利用者の資料を含まない。

作業履歴を渡さない別エージェントへ、候補スキルの入口、2件の入力、必要な参照を読む指示、外部操作・生成・ファイル変更を行わない試行範囲を渡した。期待回答、採点基準、修正仮説は渡していない。2件は同じエージェントのコンテキストで実施した。スキルを明示指定しており、カタログからの自動選択試験ではない。

実行はCodexのサブエージェントで、Gemini実機ではない。モデル設定は親から継承し、個別のモデルIDや推論設定は記録していない。以下は返却された回答の抜粋と主担当の判定であり、ツールの完全な実行ログではない。参照の読込一覧は実行担当の自己報告。旧版の同条件試行はなく、改善率や一般的な信頼性を主張しない。ソース版は[source-snapshot.json](source-snapshot.json)で特定する。

## apps-image-author

報告された参照は、Gemini入口、`prompt-design/SKILL.md`、`apps-skills.md`、`image-prompts.md`、共通側の`skill-description-review.md`。動画やワークフローの参照は報告されなかった。

回答は英語の`product-photo-edit-prompts/SKILL.md`全文だった。以下は実際の回答からの抜粋で、説明用に新しく作った出力ではない。

```markdown
---
name: product-photo-edit-prompts
description: "Use when the user asks to write or revise a Nano Banana editing prompt from a supplied product photo and requested changes. This skill authors prompts; it does not generate or edit images, or develop new product copy."
---
```

保持と変更の両立：

> Allow lighting changes to alter illumination, highlights, reflections, and shadows. When replacing the background, allow the adjustments needed to make the unchanged product sit naturally in the new scene, including consistent perspective, scale, and contact shadows.

出力と検証の境界：

> Return prompt text only. Do not invoke image generation or claim that image quality, text fidelity, or product geometry has been verified in a generated result.

主担当判定：この出力では、スキル本文の作成、生成との分離、商品形状と確定コピーの保持、光・背景の変更許容を満たした。全文には外部の兄弟スキルや未提供資料への必須参照がなく、Appsと画像の知識を一つの成果物へ組み合わせていた。読み込みと成果物のレビューによる判断であり、Appsへの取込みや画像編集の忠実度は未検証。

## antigravity-task

報告された参照は、Gemini入口、`prompt-design/SKILL.md`、`antigravity-instructions.md`。実行担当は`agent-workflow-design`を読み込んでいないと明記した。

回答は`/goal`で使う日本語のタスク本文だった。以下は実際の回答からの抜粋。

> 既存のCSV取り込み処理について、引用符で囲まれたフィールド内に改行があると行がずれる不具合を修正してください。必要な実装と検証までを行い、デプロイは行わないでください。

> テストでは、取り込まれたレコード数、対象フィールドの値、後続レコードの列対応を確認してください。再現できない場合は、その事実を明記して原因の調査を進め、推測だけで不具合が直ったことにしないでください。

> 必要な依存関係や情報がなく進められない場合は、完了扱いにせず、不足しているもの、そこまでに確認できたこと、再開に必要な条件を報告してください。

主担当判定：対象範囲、再現・回帰テスト、既存検証、未確認事項の扱いがある実用的なタスク本文になった。モデルの切替、Orchestratorのeffort指定、独自の継続ループは追加されなかった。実行制御を新設しない依頼として扱えている。実際のCSV修正やAntigravity上の継続は実施していない。

## 観測された曖昧さと採用判断

実行担当は、共通の`prompt-design`本文では`skill-creator`がCodexスキル向けとされる一方、一部の参照では一般的な「skill creation」と書かれている点を指摘した。今回はAppsの契約を選び、Codexのメタデータや依存を持ち込んでいない。対象環境を保つGemini入口とApps参照でこのケースは扱えており、この指摘を理由に共通スキルを変更しない。

この2件では採用を妨げる欠落を観測しなかった。その他8件は回帰定義として保存し、実行済みには数えない。Gemini実機、媒体品質、自動選択、旧版比較が必要な判断では追加の証拠が必要。
