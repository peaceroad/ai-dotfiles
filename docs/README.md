# ai-dotfiles の利用ガイドと設計記録

初めて使う場合は、[リポジトリの README](../README.md) で必要なプラグインや設定例を選べます。ここでは、導入したいもの、調べたい症状、確認したい設計判断から詳しい文書を探せます。

## スキルを選ぶ・作る・評価する

- **プロンプトや作業手順を書く。** 依頼文の改善、スキルの新規作成、複数の担当者による作業の設計では、使うスキルが異なります。[依頼例から選ぶ](prompt-design/skill-creator-prompt-design-agent-workflow-design.md#具体的な依頼での選び方)
- **設計に使うモデルを選ぶ。** Codexで対象を指定せずプロンプト作成を依頼すると、`prompt-design` はGPT-6.2 Astra向けに設計します。実行するモデルは利用先の設定で決まります。[モデル指定と委任の例](prompt-design/gpt-6.2-design-review.md) · [Codexのモデル設定](codex/settings/codex-config-toml.md)
- **スキルをプラグインにまとめる。** [スキルとプラグインの使い分け](skill-development/codex-skills-and-plugins.md)を確認し、[作成・検証・移行の手順](../plugins/agent-plugin-tools/README.md)へ進みます。
- **変更前後を比べる。** [評価が役立つ場面](agent-eval-tools/agent-eval-tools-use-cases.md)と [agent-improve の使い方](../plugins/agent-eval-tools/README.md)を参照してください。[評価ケースと応答](../evals/README.md)から、実際の判定根拠もたどれます。

## 開発環境を整える・配布する

- [管理用CLIをインストールする](agent-development.md#配置とインストール)。導入後は `agent info` で実行中のCLIを確認できます。
- [開発中のスキルを直接リンクする](skill-links.md)。スキルの編集元と利用先をつなぎます。利用者設定や作業記録の置き場所は [`~/.agents/` とプロジェクト内の保存先](agents-directory.md)で確認できます。
- [Marketplaceで共有する](marketplace/agent-marketplace-distribution.md)。パッケージのコピーを配布する方法と、[GitHub上のプラグインを参照するカタログを管理する方法](agent-development.md#github参照型の一覧を管理する)を選べます。
- [ホームの設定を公開用に書き出す](export.md)。公開対象を選び、コピー予定と機密情報の候補を確認してから、リポジトリの `home/` へ書き出します。

## Codexの設定とトラブル対応

- **指示や設定がどう適用されるか調べる。** [共通AGENTS.mdの設計理由](codex/settings/codex-agents-md-instruction-rationale.md) · [ユーザー設定とプロジェクト設定](codex/settings/codex-config-toml.md) · [サブエージェントの委任と待機](codex/settings/codex-subagent-runtime.md)
- **モデルや承認設定が反映されない。** [新規チャットのモデル選択](codex/troubleshooting/codex-new-chat-model-selection.md) · [承認設定の診断](codex/troubleshooting/codex-desktop-permission-diagnostics.md)
- **ブラウザーやGitの権限を確認する。** [ブラウザー設定](codex/settings/codex-browser-config-and-security.md) · [Git操作の設定](codex/settings/git-operations.md) · [WindowsでGitの書き込みが拒否された場合](codex/troubleshooting/codex-windows-git-write-acl-recovery.md)
- **会話を整理する・後から探す。** [セッションの選択と保護条件](codex/codex-session-management.md) · [書き出した会話を検索する](agent-codex.md#manage-codex-historymjs)。ほかの診断・修復機能は [Codex保守ガイド](agent-codex.md)にまとまっています。

## メインのdotを使う

ChatGPT Webでの導入から始める場合は [dot-toolkit の初期設定](dot-toolkit/setup.md)、導入後のファイルやスキルの管理は [dot の日本語ガイド](dot-toolkit/README.md)を参照してください。定期保守を登録する場合は[タスク例と設定手順](dot-cloud-maintenance.md)があります。

## 設計判断・検証結果を調べる

- **設計スキル** — [プロンプト設計とGemini対応の評価](prompt-design/README.md) · [委任・待機・復旧の設計と評価](agent-workflow-design/README.md)
- **プラグイン作成・評価ツール** — [パッケージ作成スキルの改訂記録](agent-plugin-tools/astra-review.md) · [評価方法の見直し](agent-eval-tools/measurement-review.md) · [評価ランナーの公開前確認](agent-eval-tools/prepublication-review.md)
- **実装計画と残る検証** — [セッション保存・削除](plans/ai-dotfiles-session-preservation-plan.md) · [圧縮履歴](plans/ai-dotfiles-compressed-session-plan.md) · [評価ツール](plans/agent-eval-tools.md) · [Gemini向けスキル](plans/gemini-4-skills-update-plan.md)

評価記録のモデル名・版・件数は、その試行の条件です。利用手順は対応するガイドで、検証済みの範囲は各記録の結果と未確認事項で確認できます。
