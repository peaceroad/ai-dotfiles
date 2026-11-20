# Gemini 4 Neon対応と確認範囲

2026年11月21日の公式資料照合に基づき、`gemini-instruction-design`をNeonへ対応させました。版数の調整は別途行うため、プラグイン版は`0.4.0`を維持しています。入口と7参照の構成を維持し、共通の`prompt-design`と`agent-workflow-design`は今回の変更対象に含めていません。

## 採用した変更

- **モデル選択：** Neonを入口とAPI参照へ追加しました。Carbon・Argonからの移行では、暗黙の思考設定がmediumからhighへ変わる点を確認対象にしています。Neon専用のプロンプト書式や、常時xhighを要求する指示は加えていません。[Neon公式ガイド](https://aistudio.google.com/docs/whats-new-gemini-4-neon)
- **製品ごとの設定：** Appsのモデル・思考設定はUIで選び、AntigravityのOrchestratorは固定設定であることを明確にしました。NeonのAPI仕様を他の製品へ一律適用しません。[Appsのモデル説明](https://support.google.com/gemini/answer/18648722?hl=en)、[Antigravity Models](https://antigravity.google/docs/models)
- **Appsの移植：** 1回1スキル、ファイル数・サイズの上限、依存スキルの利用可否と有効化を補いました。プラグイン全体を1つのApps用ZIPとして扱いません。[移植ヘルプ](https://support.google.com/gemini/answer/18977944?hl=en)、[管理ヘルプ](https://support.google.com/gemini/answer/17094296?hl=en)
- **長い出力：** 合計予算と各継続区間の上限、継続待ちと完了、SDKの結合結果と最終区間だけの取得を区別しました。実装時の状態保持を指示文の「続けて」で代替しません。[Long decode](https://aistudio.google.com/docs/long-decode)
- **メディア入力：** 動画のstatic／agentic処理と、stateless Interactionsで保持する処理stepsを補いました。Office／OpenDocument対応はCloud側の契約として扱い、AppsやAI Studioへの一般化を避けています。[Video understanding](https://aistudio.google.com/docs/video-understanding#agentic-video-understanding)、[Cloud Neonガイド](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-neon)

## 維持した構成と採用しなかった情報

Neon向けの独立参照は設けていません。共通の指示設計は既存の設計スキルへ委ね、製品固有の条件だけをGemini側に置きます。価格表、ベンチマーク、SDK最低版の一覧は実行用参照へ複製せず、具体的な実装・移行時に公式資料を確認します。

Gemini CLIの読み込み・有効化条件は公式文書と整合していました。今回取得したモデル選択資料ではNeon対応を確定できないため、Neon用の設定例は追加していません。Antigravity CLIの対応を通常のGemini CLIへ読み替えません。[Gemini CLIのモデル選択](https://geminicli.com/docs/cli/model/)

Nano Banana 2.1とOmni 1.2の参照は、モデル選択、プロンプト設計、入力・モード別制限に関する公式本文と照合し、変更不要と判断しました。Neonの入力理解を画像・動画生成能力と混同しない既存の境界を維持しています。[画像生成](https://aistudio.google.com/docs/image-generation)、[Omni](https://aistudio.google.com/docs/omni)、[Neonのモデル仕様](https://aistudio.google.com/docs/models/gemini-4-neon)

Tool retrievalはモデル仕様にPreview対応の表示がありましたが、詳細資料を取得できなかったため設定助言を追加していません。Appsのファイル更新手順や動画inlineサイズには公式ページ内で整合しない説明が残り、それぞれ対象UI・APIと入力経路を確認する方針を維持しています。

## 検証の位置づけ

3担当の公式資料照合と主担当の差分レビューで、参照7本を確認しました。公式資料の確認は関連する契約・助言の本文が対象であり、全言語のSDK例や全ページの逐語監査ではありません。改修後の合成依頼による確認は、指示設計時の判断を調べるもので、Geminiでの実行精度や自動選択の試験とは区別します。

履歴を共有しない別担当による2件の試行では、Appsの設定・単一スキルのインポート条件と、APIの思考設定・継続処理・動画状態を適切に区別しました。[合成依頼・応答抜粋・判定](../../evals/agent-design-tools/gemini-instruction-design/neon-forward-checks.json)を回帰確認用に保存しています。試行中に共通スキルの別変更があったため、その読込時点の版を固定した比較とは扱いません。応答を旧版より優れるという証拠にも使いません。

skill validator、portable plugin validator、配布検査26件が成功しました。文書リンクとLFも確認しました。検証対象のGemini側の版は[ハッシュ記録](../../evals/agent-design-tools/gemini-instruction-design/neon-source-versions.json)で識別できます。

Appsへの実際のインポート、モデル選択UI、Neon API呼び出し、画像・動画生成は未検証です。過去の評価応答・判定・版記録は変更していません。
