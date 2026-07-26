# Repository instructions

- `.agents/`と`.codex/`は、ホームディレクトリにある公開用ファイルのエクスポート先として扱う。ユーザー名、マシン固有の絶対パス、認証情報を不用意に追加しない。
- このリポジトリへエクスポートするスクリプトでは、通常出力、ヘルプ、エラーに、ユーザー名や展開済みのホームディレクトリの絶対パスを含めない。内部処理には実パスを使い、表示は`~`などの公開可能な表記に置き換える。
- `export.js`の機密情報チェックを広く無効化しない。例外が必要な場合は、対象と検査項目を限定する。
- `export.js`または`export.yaml`を変更したら、`node --check export.js`と`npm run check`を実行する。dry runで指摘が残っている場合は`npm run build`を実行しない。
- Windows版Codexのサンドボックス内では、`npm run build`が`.agents/`と`.codex/`への書き込みで`EPERM`になる。Codexは`npm run check`まで実行し、`npm run build`はユーザーに依頼する。
- 外部依存は、標準モジュールだけでは明確に実現できない要件が出るまで追加しない。
