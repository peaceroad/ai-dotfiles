# Codex圧縮セッションへの対応計画

この文書は、ai-dotfilesで圧縮済みのCodex履歴を読み取り、元形式を保持してexportし、検証済みの保存物を根拠に削除できるようにする設計案です。対象はローカル履歴の可逆圧縮（`.jsonl` → `.jsonl.zst`）で、LLMの会話コンテキストを短縮するcompactionとは別の処理です。

**圧縮対応は未実装です。** 以下の方式・受入条件は今後の実装に求める内容で、現在のコマンドが保証する動作ではありません。実装・検証の基準はNode.js 26.10.0とする方針です。対応する配布版・OS・上限値は受入試験で確定します。

## 共通計画との関係

全体の課題分類、実装済みのDB保全修正、非圧縮にも適用する履歴境界検証とCLI起動時更新への対策は、[保全・削除の改善計画](ai-dotfiles-session-preservation-plan.md)で管理します。作業順もそちらを入口にしてください。本書は圧縮形式の読取、保存形式、物理ファイル一覧の照合、圧縮削除の条件を詳述します。

調査基準は2026年10月6日時点に確認した固定commitです。ai-dotfilesの比較元d4747236はDB修正前の版、Codex側は822e58ccです。「基準版の挙動」と「実装方針」を区別し、公開mainの挙動を配布版全体の保証とはみなしません。利用手順は[現在の利用説明](../agent-codex.md)を参照してください。

## 推奨する構成

1. 既存の非圧縮JSONLの読取・閲覧互換を維持し、DB保全と履歴境界の共通検証を独立して強化する。圧縮ファイルの全読み取りは一つの検証済みreaderへ集約する。

2. セッションID、rollout ID、物理ファイルの表現形式を分けて管理する。同じrolloutの `.jsonl` と `.jsonl.zst` を、別セッションとして数えない。

3. エクスポートでは主ログと同一セッション所有の追加ログを、元の形式・バイト列のまま保存する。人が読む `conversation.md` は従来どおり生成する。

4. 元ファイルのSHA-256と、展開後のJSONLバイト列のSHA-256を別々に保持する。削除では物理ファイル一覧と元バイト列の一致を必須にし、再圧縮・新規ファイル・更新を検出したら保存し直す。

5. 別セッションに属するフォークの依存元は、展開後の指定バイト境界までだけを保存する。同一セッション所有のrevert元は全体保存の対象とし、参照prefixの境界検証と分ける。

6. 削除は公式CLIへ委ね、保存内容の検証、全参照元の検査、利用者の確認、直前再検査を通った対象だけに限定する。

**decoderはNode.js 26.10.0の標準zstdを採用する方針です。** 途中切れ・連結frameの修正を取り込み、`rejectGarbageAfterEnd: true` と受入試験を組み合わせます。既存の非圧縮JSONLとv2エクスポートの互換性を維持し、旧Node 24での非圧縮機能を残すかは配布時の互換方針として扱います。

## 基準版が圧縮を止めている箇所

基準は [ai-dotfilesのmainに対応するcommit d4747236](https://github.com/peaceroad/ai-dotfiles/commit/d4747236a2d079d96dfc47d71e23783b21e6600c) です。基準版の停止は、拡張子の見落としだけではありません。誤った形式をJSONLとして保存したり、読み取れない参照関係を無視して削除したりしないための保護が複数箇所にあります。

| 経路 | 現行の挙動 | 圧縮対応で必要な変更 |
| --- | --- | --- |
| 選択セッションの検査 | `.jsonl.zst` を受け付けない | 形式の認識と安全な展開能力を検査 |
| フォーク元の収集 | 圧縮・候補重複を欠落警告にする | rollout単位の解決と展開後prefixの収集 |
| 同一セッションの追加rollout | 圧縮版があると停止 | 所有する全rollout・全物理表現を列挙 |
| 削除の参照検査 | 圧縮版しかないrolloutは停止 | 圧縮・非圧縮の参照元を両方検査 |
| 保存内容の検証 | manifest v2と `rollout.jsonl` を前提 | v2互換を保ったv3検証 |
| 保存済み履歴の閲覧 | v2の `conversation.md` を読む | v3を認識し、読込前の検証を更新 |

[選択セッションと参照関係の検査](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L390-L468)、[依存元と追加rolloutの収集](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-content.mjs#L67-L143)、[manifestの読込と検証](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-storage.mjs#L148-L190)を同じ変更範囲として扱います。

現行エクスポートの契約は、会話・生ログ・対応する履歴DB行・収集可能な添付物を参照用に残すことです。[利用説明](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/docs/agent-codex.md#L185-L199)は、`complete: true` を書き出し処理の完了とし、完全復元やCodexへの再取り込みを保証していません。圧縮対応後も、この制限を維持します。圧縮解除できても、元のUI状態・成果物・外部ファイルまで復元できるわけではありません。

## Codexの圧縮処理が保証すること

Codex側の基準は [commit 822e58cc](https://github.com/openai/codex/commit/822e58cc3d666166c7446c5b1ea2e52f5d09594c) です。[現在の圧縮候補判定](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs#L645-L724)は、通常履歴とアーカイブ履歴を対象にし、[ファイルmtimeが7日以上前](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs#L974-L998)であること等を条件にします。DBの更新日や最後に画面を開いた日を基準にしているわけではありません。

[圧縮の実装](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs#L845-L966)はzstd level 3を使用し、元ファイル長をframe content sizeとして設定します。独自辞書は渡していません。[生成物の検査](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs#L1010-L1035)は最後までdecodeできることを確認するもので、元JSONLと生成物を暗号学的ハッシュで照合する処理ではありません。checksumを必須にする設定も見当たらないため、ai-dotfiles側はchecksumなしの正当なframeを扱う必要があります。

圧縮時は同じディレクトリの一時ファイルへ書き、flush・decode検証・元ファイルの長さ等の再検査・syncを行い、writerとのpublication lockを取って `.zst` を上書きなしで公開し、最後に元 `.jsonl` を取り除きます。mtimeと権限を保持します。この順序では両形式が一時的に共存し得ます。二つのファイルパスとDBが一度に置き換わる単一transactionとは扱えません。writer所有権が残っている場合の圧縮抑止はありますが、ai-dotfilesがその排他へ参加しているわけではありません。

[読取時の解決規則](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression/path_metadata.rs#L10-L18)はplainを優先し、古い `.jsonl` パスから圧縮版を見つけることもできます。[追記時](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs#L124-L197)はplainへmaterializeしてから書きます。したがって、export計画を作った時と実行時で拡張子・ファイル集合・ハッシュが変わる可能性を通常の競合として扱います。

[feature定義](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/features/src/lib.rs#L1242-L1253)では `local_thread_store_compression` は開発中・既定無効です。一方、[experimental RPCのrollout/compress](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/app-server/README.md#L198-L210)はflagの変更とは別にworkerを開始でき、空の応答は受付を意味します。デスクトップアプリの圧縮UIが、このflagとRPCのどちらへ接続されているか、各配布版でどの設定が有効かは別途確認が必要です。公開mainの既定値を、そのままユーザーのアプリ設定とみなしません。

公式の [seekable readerのテスト](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/seekable_reader_tests.rs#L47-L78)には、content size付き・なしと連結frameが含まれます。現在の圧縮workerが作る典型的な単一frameだけに合わせ、後続frameを無視するreaderは互換性を満たしません。対応しないframe構成は明示的に拒否する必要があります。

## セッションとファイルの識別を分ける

**セッションIDだけをキーにしてログを一つへまとめてはいけません。** Codexの [HistoryPositionの定義](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/protocol/src/protocol.rs#L3080-L3093)では、`history_base.thread_id` は固定のセッションIDと異なる場合があるrollout IDです。revert等を経た同一セッションは複数のrolloutを所有できます。

[ファイル名の定義](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/rollout_file_name.rs#L10-L73)に沿って、論理キーを `threadId + rolloutId`、物理キーをその下の実際のパス・codec・ファイル識別子として扱います。古い `…-<threadId>.jsonl` と、新しい `…-<threadId>_<rolloutId>.jsonl` の両方を維持します。大文字小文字、Windowsの拡張パス、通常履歴とアーカイブ履歴も既存の正規化規則へ合わせます。

同じrolloutに `.jsonl` と `.jsonl.zst` が存在する場合は、次の順で判断します。

- 両方の物理ファイルを候補一覧に残す。片方を見つけた時点で探索を打ち切らない。

- 所有セッション、rollout ID、展開後の正確なバイト列が一致することを検証する。

- 一致しても、削除で両方が消えるなら両方の元バイト列を保存・照合する。会話表示は一度だけ行う。

- 内容が異なる、途中切れ、所有者が異なる、候補が増減する場合は曖昧な状態として停止する。時刻が新しい方を推測で採用しない。

- 別ディレクトリに同じrollout IDが重複する場合も、通常の圧縮変換と決めつけない。

Codexの [current rollout解決](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/thread_rollout_resolver.rs#L67-L108)は、稼働中writerやDBで選択されたrolloutを考慮します。特にpaginated履歴では、DBが選ぶものを無視してファイル名やmtimeだけで古いrolloutへfallbackしない設計が必要です。ファイルの識別と、現在選択中のrolloutの特定は別の責務です。

## 共通readerの設計

新しい `session-rollout-io.mjs` のような小さなモジュールへ、通常ファイルの安全確認、codec判定、bounded streaming、物理・展開後ハッシュ、JSONLの境界検査を集約します。名称は提案です。安全なopen、byte列の解析、共通のlineage境界検証を分離し、既存のplain経路とzstd経路が同じ検証結果を使う構成にします。

readerは次の責務を持ちます。

1. sourceは許可された履歴root、保存物は検証済みbundleまたはstaging rootの内側に限定して通常ファイルを開く。呼出元ごとのroot制約を保ち、symlink、junction/reparse point、hardlink、device、pipe、root外への逃避を拒否する。

2. 物理ファイルをstreamとして読み、元バイト数とSHA-256を計算する。拡張子と認識した形式の不一致をエラーにする。

3. 非圧縮なら同じバイト列を、zstdなら厳密に展開したバイト列を、後段へ流す。

4. 展開後バイト数、SHA-256、行番号、LFまでの累積byte offsetを計算する。文字数やJavaScriptのstring.lengthでoffsetを数えない。

5. fatal UTF-8 decode、JSON構文、行長、最終LF、必要なsession metadataを検査する。未知のイベントtypeを勝手に捨てて「完全」としない。

6. sourceのEOFだけでなくdecoderの正常終端を待つ。入力の未消費、frame途中終了、checksum error、末尾ごみを成功扱いにしない。

7. source、decoder、writerのどこかが失敗・取消されたら全streamを止め、終了を待ってから戻る。部分出力を完了manifestへ載せない。

既存の [jsonLines](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-storage.mjs#L111-L145)は、UTF-8不正、JSON不正、128MiBを超える行、末尾の未完レコードを拒否します。この保護は維持し、圧縮データを先に文字列へ変換したり、全体を一括readFileしてから展開したりしない方針にします。JSON.parseの生エラーには会話内容が含まれ得るため、利用者向けエラーは場所と分類だけにします。

先頭の `session_meta` を読む用途にも共通readerを使います。ただし、先頭レコードが読めたことはファイル全体が正常である証明になりません。削除の安全性に使う圧縮候補は、必要なmetadataを得た後もdecoderを終端まで検証するか、別の厳密な全体検証を完了させます。表示だけの軽い検査と、削除を許可する検査結果を同じフラグで表さないことが重要です。

## zstd decoderとNodeの対応条件

[package.json](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/package.json)の要求はNode.js `>=24`で、npm依存はありません。標準zstd APIが利用できる世代ですが、APIの存在と安全な全入力処理は分けて検証します。

Node公式の [途中切れを受理する問題 #64592](https://github.com/nodejs/node/issues/64592)は2026年7月19日に報告され、修正は [Node 24.20.0](https://nodejs.org/en/blog/release/v24.20.0)と26.6.0へ入りました。一方、[連結frameをchunk境界によって取りこぼす問題 #64741](https://github.com/nodejs/node/issues/64741)の修正は [Node 26.10.0](https://nodejs.org/en/blog/release/v26.10.0)の公開コードへ入っています。Issueのopen/closed表示だけで修正の有無を判断せず、[実際にlandした修正](https://github.com/nodejs/node/commit/678ff3561a33bbb83209aeecc6c241e285ba893a)と配布tagを基準にします。

確認した [Node 24.21.0のdecoder](https://github.com/nodejs/node/blob/v24.21.0/src/node_zlib.cc#L1785-L1816)からは、連結frameについて26.10.0と同じ修正を確認できません。採用基準とする [Node 26.10.0は2026年9月22日公開](https://nodejs.org/en/blog/release/v26.10.0)のCurrentリリースです。2026年10月6日時点の [公式リリース計画](https://github.com/nodejs/Release/blob/main/schedule.json)では、26系のLTS開始は2026年10月28日予定です。LTSへ移る際は、その時点の対応patchと回帰試験を確認します。

採用方針は、**Node.js 26.10.0を基準に標準zstdを使い、`rejectGarbageAfterEnd: true` と受入fixtureで確認する方式**です。将来の版も数字だけで自動的に信頼せず、対応表と回帰テストを更新します。旧runtimeを残す場合も、圧縮の読み取り・削除は対応条件を満たさなければ説明付きで止めます。小さな自己診断fixtureは既知の回帰を検出する補助であり、すべての不正入力に対する安全証明ではありません。

| 選択肢 | 利点 | 条件と弱点 |
| --- | --- | --- |
| 検証済みNode標準zstd | npm依存を増やさずstreamを統合できる | Node版とstrict終端処理を限定する。既存Node24すべてを対応扱いにできない |
| 公式zstd CLI adapter | Node24を維持できる可能性がある | 実行ファイルの導入・版・配置、Windows対応、終了コード、stderr、取消とメモリ制限を追加管理する |
| JSまたはWASM実装 | runtime差を吸収しやすい | 正常終端・dictionary・frame・メモリ上限の検証と依存供給元の保守が必要 |
| 全体をbufferへ展開 | 実装が短い | 大容量でメモリを使い切るため採用しない |

Node24のまま圧縮も必要な場合は、公式zstd CLI adapterを第二段階の候補にします。採用前に公式配布物と対象版を確認し、shellを介さず固定した実行ファイルと引数を使います。CLIが見つからない場合に自動ダウンロードや別ツールの実行へfallbackせず停止します。標準モジュールで要件を満たせる場合は外部依存を増やさないという [リポジトリの依存方針](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/AGENTS.md)とも整合します。

## エクスポートの保存形式

初期版は**元形式保持を既定**にします。入力が非圧縮なら従来どおりJSONL、圧縮済みなら圧縮された元バイト列をそのまま保存します。これにより、圧縮を有効にして減らしたログを保存先で必ず膨らませることを避け、削除前の物理SHA照合も明確になります。

| 保存方式 | 容量と扱いやすさ | 削除との関係 |
| --- | --- | --- |
| 元形式を保持 | `.jsonl.zst` を維持し、閲覧用Markdownを別に生成 | 元物理bytesを保存したことを直接検証できる。初期版の推奨 |
| 展開済みJSONLだけを保存 | 汎用ツールで読みやすいが容量が増える | 論理ログは可逆に保存できるが、元の圧縮ファイル自体の保持とは区別が必要 |
| 圧縮版と展開版を両方保存 | 利便性は高いが容量・I/Oが増える | 検証対象も二重になる。常時の既定にはしない |
| conversation.mdだけを保存 | 読みやすく小さくしやすい | 未表示eventやtool output等を失うため、元ログ削除の根拠にしない |

bundle内の主ログ名は、非圧縮なら `rollout.jsonl`、圧縮なら `rollout.jsonl.zst` とし、実際のエントリーをmanifestで指定します。追加rolloutは `rollouts/<rolloutId>.jsonl[.zst]`、依存元の必要範囲は `dependencies/<rolloutId>.jsonl` とします。同じrolloutの両形式を保存する場合は両方をinventoryへ登録し、どれから会話を生成したかを明示します。

元のCodexホーム内で先に解凍したり、ファイルをrenameしたり、圧縮設定を切り替えてからexportしたりしません。exportはsourceを読むだけに保ちます。展開後の内容を一時ファイルに出す必要がある処理は保存先の制限付きstaging内で行い、Codexの管理ファイルへ書き戻さない設計にします。

非圧縮JSONLへの変換保存は将来の明示オプションとして分離できます。ただし初期版に両方の保存policyを持ち込むと、削除可否の規則とテストが増えます。まず元形式保持で圧縮exportと検証を完成させ、その後に変換保存の需要と契約を決める方が実装範囲を小さくできます。

## manifest v3と後方互換

現行v2は `rollout.jsonl` の存在を必須にし、ファイルsize・SHA-256とmanifestのcontentDigestを検証します。圧縮されたバイト列を同じファイル名へ入れたり、`sha256` の意味を展開後ハッシュへこっそり変更したりせず、**新しい保存形式はschemaVersion 3**とします。v3のdigestと重複排除は下記の版別契約に従い、v2のdigestへ新しい意味を上書きしません。

| 情報 | 意味 |
| --- | --- |
| threadIdとrolloutId | 安定したセッションの所有者と、その履歴世代の識別子 |
| sourceArtifacts | 今回の削除で消え得る全物理ログの一覧 |
| codec | `identity` または `zstd`。拡張子だけを根拠にしない |
| storedBytesとstoredSha256 | 元の物理ファイルのバイト数とハッシュ |
| decodedBytesとdecodedSha256 | 展開後のJSONLを再シリアライズせず測った値 |
| retainedFileとretention | 保存先member名と、`full-physical` または `decoded-prefix` 等の保存範囲 |
| dependencyBoundary | 依存rollout ID、endByteOffset、endOrdinalExclusive、保存prefixのSHA |
| coverage | rawログ、lineage、DB行、添付物、表示変換の到達範囲 |
| validation | 検証policy版、decoder/backend版、検査済みの終端・形式条件 |
| artifactSetDigest | ソートした全物理ファイル集合と、そのsize・SHA等に対するdigest |

物理ハッシュと展開後ハッシュの関係は明確にします。非圧縮なら同じ値になります。圧縮levelや実装が変わると、内容が同じでも物理ハッシュは変わり得ます。展開後ハッシュはUTF-8の元バイト列、改行、空白、順序を含めた値です。JSONをparseして再出力した文字列や、conversation.mdのハッシュとは交換できません。

`storedSha256` があるだけでは元バイト列を保存したことになりません。`retainedFile` と保存policyを検証し、主ログ・所有する追加ログには完全な物理コピーを要求します。依存元のprefixはそれとは異なる保存範囲として扱います。manifest自身とbundleを同時に書き換えられる相手に対して、自己ハッシュは真正性の証明にはならないという既存の説明も維持します。

新readerはv2とv3を読めるようにし、既存v2のファイル名・ハッシュの意味・閲覧結果を変えません。旧readerがv3を認識しない場合は、アップグレードが必要と明示します。現行でも未対応のv1を、この変更に便乗して自動移行する必要はありません。過去のbundleをその場でv3へ書き換えず、新しいsnapshotを作ります。

batch receiptは既存schema v1を読み続け、v3の全物理inventoryへ結び付ける新しい契約にはbatch schema v2を用意する案が明確です。manifest digest、source-home identity、対象family、artifactSetDigest、検証policyを結び付けます。古いbatchに圧縮削除の証明を推定で補いません。通常の閲覧互換と、削除の許可に使える互換は分けて扱います。

`complete` は処理完了、coverageは保存できた範囲、削除可能性は現在のsourceと照合した結果です。後者を永続の `canDelete: true` として信頼してはいけません。削除時に毎回計算し直し、将来の状態変化で無効になります。

### v3のdigestと重複排除を版ごとに定義する

これは新しい保存形式の実装契約です。現行v2の不具合として扱いません。現行の [snapshotDigest](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-storage.mjs#L30-L32)は7項目を明示列挙し、[既存snapshotの再利用](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L775-L782)はsession IDとcontentDigestを基準にします。v3フィールドをトップレベルへ追加するだけでは、digestへの結び付けも版をまたぐ再利用の防止も成立しません。

- v2のdigest関数と既存fixtureの期待値は固定し、v3専用のdigest入力を構築する関数を追加する。

- v3はformat、schemaVersion、保存契約・検証policyの版、session、files、warnings、attachments、spawnEdges、sources、coverage、sourceArtifacts、DB対象ID集合、dependencyBoundary、validation、artifactSetDigestを結び付ける。codec、retention、物理・展開後・prefixのbytesとSHAも各要素の中で対象にする。自己参照するcontentDigestを除き、安全判定に用いるフィールドを対象外にしない。

- digest入力のオブジェクトkey順、ID集合とinventoryのソート、未設定値の表現を固定する。JSONLの元bytesは再シリアライズせず、既に計算したハッシュを結び付ける。schemaにない安全判断フィールドや未対応policyは削除判定で拒否する。

- 重複排除キーはsession ID、schemaVersion、保存契約・policyの版、contentDigestとし、同じ契約のsnapshotだけを再利用する。新規v3 exportを、v2の既存snapshotで「Unchanged」にしない。

- 新しい各安全フィールドの単独改変、v2だけがある状態での初回v3 export、同じv3の再export、policyが違うv3、未知schema・policyを試験する。v2の閲覧互換と、新契約を満たす削除証明を別々に判定する。

## フォーク履歴の境界と添付物

圧縮対応で特に危険なのは、`history_base.end_byte_offset` を圧縮ファイルのbyte offsetとして使うことです。[Codexのseekable reader](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/seekable_reader.rs#L1-L4)は、このoffsetが元JSONLのバイト位置であると明示しています。圧縮ファイルのstat.sizeよりoffsetが大きくても、それだけでは異常ではありません。

依存元の保存は次の順にします。

1. `history_base.thread_id` をrollout IDとして解決し、所有者metadataと履歴modeを確認する。

2. 元形式を読み、zstdなら展開した正確なbyte列を数える。

3. 指定offsetでLF直後に到達し、途中のUTF-8文字やJSON recordを切っていないことを検証する。

4. 指定範囲だけを `dependencies/<rolloutId>.jsonl` に保存する。JSON再出力や改行変換はしない。

5. [共通の履歴境界検証](ai-dotfiles-session-preservation-plan.md#圧縮とは独立した履歴境界の共通検証)の規則で、展開後のbyte境界・record ordinal・継承開始位置を照合する。`end_ordinal_exclusive` を行数へ置き換えず、所有者・履歴mode・祖先関係・循環も検査する。

6. 圧縮containerの終端検証が必要なら残りを保存せず読み流し、全体のdecoder完了を待つ。

7. 依存元の物理identityと、保存したprefixのハッシュを公開直前に再確認する。

親の `.jsonl.zst` 全体をコピーする案は避けます。子が参照する境界より後に親の会話が続いていれば、選択対象外の内容まで保存するためです。全体の検証と、保存・表示する範囲を分離することが、完全性と必要最小限の保全を両立させます。

展開後の会話生成では [既存の添付収集ルール](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-content.mjs#L171-L260)をそのまま使います。対応する埋込画像・音声と、明示的に許可されたroot内の構造化参照だけを扱い、本文やtool output中のパス・URLを追跡しません。圧縮されていたことを理由に、添付物の収集範囲や48MiB上限を広げない方針です。

現在のexportは4種類の履歴DBテーブルを扱い、[thread_attachmentsのmembership metadata](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/state/migrations/0051_thread_artifacts.sql#L1-L9)まで網羅するものではありません。公式削除でそのmetadataがcascadeされることと、リンク先の添付payloadが消されることは別です。v3ではcoverageの不足を表示し、必要なら別途対応します。外部添付物が削除されるという未確認の前提で規則を増やさないようにします。

同様に、[hookのtranscript_path](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/core/src/session/mod.rs#L5012-L5023)はcurrent rolloutを指すため、独立した `.transcript.jsonl` が常にあると仮定しません。アプリ固有のsidecarを対応範囲へ追加する場合は、実際の保存仕様と削除範囲を先に確認します。

## 削除で維持する安全条件

新しく解禁する圧縮ログの削除は、初期版では**検証済みv3エクスポートに対応する `delete --exported` に限定**します。非圧縮のコマンド構造は維持しつつ、DB保全、共通lineage検証、CLI起動時更新の抑止を共通の安全条件として適用します。圧縮ログをexportなしで直接削除する経路は、別の受入条件を整えるまで停止を残します。

削除の順序は次のとおりです。

1. source-home、対象UUID、family、保護状態、保存先、batchの結び付きと、対応CLI版・安全な起動設定を確認する。期間条件を再計算して対象を増やさない。

2. bundle全memberのbytes・SHA、manifest digest、retention範囲、decoder検証を確認する。

3. Codex homeの通常・アーカイブ履歴を新しく列挙し、索引にないものを含め、所有する全rolloutと全形式を取得する。

4. sourceArtifactsと完全一致することを確認する。元の物理SHAが変わった、追加 `.zst` ができた、revertで世代が増えた場合は再exportを要求する。

5. 所有する全rollout IDとlegacy互換のstable session IDを重複排除した集合で、現行のDB行を照合する。保存時の対象ID集合、親子関係、保護状態も確認し、変わったfamilyは除外する。DB対象集合の共通処理は[DB保全の修正](ai-dotfiles-session-preservation-plan.md#圧縮とは独立した履歴db保全の修正)を引き継ぐ。

6. 削除対象外のフォーク参照を調べる。参照元が未保存・保護対象・期間外なら、依存する祖先も残す。候補へ勝手に追加しない。

7. 対象、件数、関連family、保存済み範囲、自動復元に対応しないことを提示し、削除専用の確認を得る。

8. 確認直後と各family実行直前に、稼働process、ファイル集合・SHA、DB対象ID集合と全対象行、参照グラフを再検査する。

9. 起動時のcompressionとbackground migrationを抑止できると検証した公式CLI・実行設定で、同じsource-homeの1 familyずつを渡す。参照元から祖先へ処理する。未検証の版や接続形態では呼び出さない。

10. 公式CLIの終了状態と、対象の索引・物理ファイルが消えたことを確認する。途中失敗・不確実な結果では停止し、完了した対象だけを報告する。

[現在の削除経路](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L1153-L1214)も、公式CLIをfamily単位で呼びます。ai-dotfilesから直接unlinkやSQL DELETEへ置き換えません。[公式側の処理](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/delete_thread.rs#L30-L136)は所有rollout、参照保護、writer/lifecycle、索引等を扱うため、ファイルだけを消す代替にはできません。

削除参照の検査で、圧縮が壊れている・decoderが使えない・未知のdictionary・資源上限超過・metadata不正があった場合は「参照なし」にせず停止します。どの候補へ影響するかを証明できないなら削除全体を止めます。既知の参照で削除不可のfamilyだけを除外できる場合とは区別します。

### 混在形式の検証漏れを先に塞ぐ

修正前の [inspectDeletionReferences](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L442-L463)は、同じrollout IDにplain候補があると圧縮側を調べません。[exported deletionの照合](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L848-L874)と組み合わせると、plainを保存した後に圧縮siblingだけが追加され、主ファイルとmetadataが不変である場合、その追加物を保存・検証しない経路が残ります。

[公式deleteは両形式を削除する](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/delete_thread.rs)ため、圧縮側の未検証を許してよいとは言えません。これは静的なコード経路から導いたリスクで、実データの消失事故や再現試験の報告ではありません。先行修正として「plainと共存するものを含む未検証 `.zst` があるなら削除停止」を実装し、合成fixtureで停止を確認しました。初期の圧縮対応版でも、両形式共存を安全に処理できるまで共存自体を止める選択肢があります。

### 失敗後に戻せるとは説明しない

圧縮exportが完全な元バイト列を保存していても、削除のtransactionを巻き戻す機能やアプリ全体の復元機能にはなりません。途中まで成功した一括削除を自動再試行しません。`backups/sidebar-refresh/` は [サイドバー照合状態の保全](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-sidebar-cache.mjs#L73-L104)であり、削除した会話のバックアップではありません。README・確認画面・完了表示のいずれでもこの違いを保ちます。

## 同時更新と途中失敗

**全クライアントを閉じた状態を前提にする条件は残します。** Codexアプリ、CLI、IDE、自動実行、同じhomeを共有する別PCのwriterが動いていると、検査と公式CLI実行の間に状態が変わり得ます。これに加え、削除用CLI自身が始める更新処理は[CLI起動時更新の対策](ai-dotfiles-session-preservation-plan.md#削除cliの起動時更新を抑止する)の条件で止めます。独自のlock fileやprocess一覧のsnapshotだけで、一般的な検査後の競合まで完全に排除したとは言えません。

exportは、まず主ログ・所有追加ログの物理コピーをstagingに作り、保存したコピーから会話を生成すると、内容が変わるsourceを繰り返しdecodeする範囲を減らせます。その後、sourceのidentity・size・mtime・SHAと、freshなファイル一覧を再取得します。現行の [createRolloutIndex](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-content.mjs#L35-L65)は一操作内でcacheするため、公開直前の検査にはcacheを再利用しないことが必要です。

パスのlstat後に別ファイルへ差し替わる競合には、openしたfile descriptorのfstatと比較し、可能なOSではリンク追跡を抑止します。前後のfile identity、size、mtimeだけでなくSHAも見ることで、同size・同mtimeの内容変更も検出します。ただしWindows等で同じAPIが使えない場合は、対応条件を明示して検証し、POSIXの仕組みをそのまま移植したことにしません。

stagingのコピー、展開、会話・添付生成、再読hash、source再検査がすべて成功してからmanifestを完成させ、最後に通常のsnapshot名へ公開します。容量不足、decoder error、DB変更、source消失、取消では `.incomplete-…` の扱いを維持し、batchへ成功エントリーを追加しません。途中まで公開された別snapshotがある場合は、その件数を明示します。

削除直前の保存耐久性まで要求するなら、通常のclose・再読hash・renameに加え、保存ファイル、manifest、receiptのsyncとディレクトリ公開順序を検討します。再読できることと、停電後にも保存済みであることは同じ保証ではありません。OS・ファイルシステム・外付けdriveによる差を受入試験に含め、同期できない状態を隠して削除可能にしない設計にします。

## 容量と処理時間の制御

可逆圧縮の入力サイズだけを見て、展開後の必要容量やメモリを見積もらないようにします。frame content sizeは無い場合や不正な場合もあるため、実際の出力バイトを数えます。圧縮率だけを上限にすると、正常な繰り返しの多いログまで拒否しやすくなります。絶対量の上限、展開窓、最大行長、処理期限を分けて管理します。

初期の設計値候補は、同時展開1本、`ZSTD_d_windowLogMax = 27` による128MiBの展開窓、現行の128MiB行長上限の維持です。これらは実測から決定した値ではありません。[Nodeのzstd options](https://nodejs.org/api/zlib.html#class-zstdoptions)のwindow上限はプロセス全体のRSS上限ではなく、`maxOutputLength` もstream全体の出力量を自動制限する代わりにはなりません。sourceとdecoded streamの両方に累積カウンターを置きます。

操作ごとの圧縮入力量・展開総量・添付総量・出力総量をそれぞれ制限し、上限変更は明示的に行います。値は大きな履歴でのfixture試験後に確定し、超過時に黙って無制限へ切り替えません。出力先の空き容量検査、backpressure、取消、有限の処理期限、エラー時の全stream終了を組み合わせます。展開中の圧縮ファイルを削除するオプションは設けません。

圧縮後の容量はログ内容によって変わるため、固定の削減率は提示できません。入力が既に圧縮されている場合も、conversation.md・添付物・依存prefixを足したbundleが元 `.zst` より小さくなる保証はありません。保存先を同じdriveにすると、検証完了までは元履歴とexportの両方が必要です。容量整理の目的なら、外付けdrive等の保存先とピーク使用量も計画へ表示します。

性能試験では、圧縮入力bytes、展開bytes、保存bytes、elapsed time、CPU、peak RSS、一時領域のピーク、再読回数を分けます。キャッシュあり／なし、ローカルSSD／外付けdrive、フォークが共有する同じ依存元の数を条件として記録します。合成fixtureによる測定は生成条件を明記し、実利用環境の測定結果とは区別します。公開する記録に実ユーザーのログや環境測定値を含めません。

## CLIと利用者向け表示

既存のコマンド構造を維持し、圧縮のためだけに自動変換コマンドを追加しない方針が分かりやすくなります。`list`は物理保存サイズとcodecを示し、展開後サイズが未検証ならunknownとします。`plan export`は入力codec、保存形式、必要なdecoder、見積りに含まれない依存・添付分を説明します。削除計画の件数はセッションまたはfamily、ファイル数は別項目として表示します。

エラーは、本文や秘密を表示しない安定した分類へ変換します。例は `ZSTD_RUNTIME_UNSUPPORTED`、`ZSTD_TRUNCATED`、`ZSTD_TRAILING_DATA`、`ZSTD_DICTIONARY_UNSUPPORTED`、`ROLLOUT_VARIANTS_DIVERGE`、`SOURCE_CHANGED`、`DECODED_LIMIT_EXCEEDED` です。名前は提案です。[現行errorTag](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L28-L31)の形式へ明示的にmapし、Nodeの生エラーcodeをそのまま通してunknownにしないようにします。

利用者への説明は、原因と次の行動を結び付けます。

- runtime未対応：圧縮機能には検証済み版が必要。旧runtimeの非圧縮互換を維持する構成で配布する場合に限り、非圧縮機能は利用可能と案内する。

- source変更：保存後に圧縮形式または内容が変わった。新しいexportを作ってから削除計画を確認。

- 参照元未検証：残るフォークへの影響を確認できないため削除を停止。

- 容量・上限超過：必要な領域または上限を見直して再計画。部分保存は削除の根拠にしない。

- 途中失敗：完了したsnapshotまたはfamilyと、未完了の範囲を表示。

**圧縮機能の実装・検証基準はNode.js 26.10.0にします。** 26系全体を一括で対応扱いにせず、strict decoderと保存・削除設計を組み合わせます。DB保全と履歴境界の独立修正は既存の非圧縮runtimeでも検証し、26.10.0への移行待ちにしません。旧Node 24で独立修正を検証することと、圧縮対応版をNode 24でも配布することは別の判断です。後者は未決定で、以下の旧24の非圧縮対応は互換を維持する配布構成を採用した場合の案です。Nodeの対応表は機能単位で持ちます。

| Node版 | 初期設計での扱い |
| --- | --- |
| 24.0.0等の旧24 | 互換を維持する配布構成の場合のみ非圧縮を提供。圧縮を拒否 |
| 24.20.0と確認した24.21.0 | 途中切れ修正だけで十分とせず、圧縮の正式対応から除外 |
| 26.9.x以前の26系 | 26というメジャー番号だけで対応判定しない |
| 26.10.0 | 採用する実装・検証基準。strict設定と受入試験を実施 |
| 以後の版 | 公式変更と回帰試験で対応表を更新 |

既存の [OS別の範囲](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/docs/agent-codex.md#L16-L21)も変えません。list・plan・exportは全OS向けですがmacOS/Linuxは実機未検証、archive/deleteはWindows限定です。zstdが読めるようになるだけで、削除のOS制約がなくなるわけではありません。

## 変更対象と実装単位

以下は共通計画を含む変更箇所の対応表です。DB対象ID集合の保存・再照合、plain境界検証の初期subset、CLI起動時更新の抑止は実装済みです。圧縮readerはこれらへ統合します。

| 対象 | 主な変更 |
| --- | --- |
| 新規の共有rollout I/Oモジュール | sourceとbundleのopen policy、codec、strict decode、資源制限、bytes・hash・終端状態 |
| 共通lineage検証処理 | byte境界・record ordinal・継承開始位置を照合。まずplainで実装し、圧縮readerからも利用 |
| session-export-storage.mjs | 独立修正のDB・lineage記録の検証、stream入力、版別digest、v2/v3読込、inventoryと保存member検証 |
| session-export-content.mjs | 所有rollout IDの共通収集、metadata、依存prefix、追加rollout、会話・添付生成への共通検証適用 |
| manage-codex-sessions.mjs | exportと削除前のDB集合照合、同schema・同保存契約のdedup、全参照検査、安全なCLI起動と直前再検査 |
| session-export-batches.mjs | 全所有rollout IDとlegacy IDのDB抽出。新receipt契約、v1互換、manifestとartifact集合への結び付け |
| manage-codex-history.mjs | v3認識、保存内容の検証、既存のMarkdown検索・読取の維持 |
| codex.mjsとinstaller関連 | 共有ファイルのsupportFiles同梱、runtime能力の説明、単体実行の確認 |
| package.jsonとテスト群 | 独立修正、decoder、digest移行、実CLI互換の各試験を追加し、既存検証を維持 |
| docsとhelp | codec要件、保存形式、共通検証で止める条件、削除条件、復元非対応を更新 |

特に [codex.mjsのsupportFiles](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/codex.mjs#L53-L67)へ新moduleを入れ忘れると、repositoryでは動いてもインストール済みCLIや単体コピーで失敗します。plugin cacheやskillの配置にruntimeが依存しない、既存の自己完結した配布を維持します。

実装は、DB保全、共通lineage検証、圧縮readerと保存形式、削除CLIの安全な起動の単位に分けます。新しい共有処理を追加した場合は、metadata、dependencies、owned rollouts、rendering、bundle verification、exported deletion、unindexed/archived reference scanの該当する呼出元へ適用します。保存済みhistoryの検索自体は引き続きconversation.mdを使い、raw全件を毎回検索する仕様変更は避けます。

## 必須のテストと受入条件

テストは小さな合成ログと固定したzstd fixtureで行い、実ユーザーのセッションをfixtureに使いません。期待値を「同じNodeで圧縮して同じNodeで復元した結果」だけから作らず、既知の展開bytes・SHAと公式zstd由来のfixtureを組み合わせます。現在の [圧縮未対応テスト](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.test.mjs#L465-L475)は文字列の模擬ファイルを使うため、実際のdecoder検証を追加する必要があります。

### reader単体

- 同じJSONLのplain/zstdから、同じdecoded bytes・SHA・行番号・offsetを得る。

- checksumあり／なし、content sizeあり／なし、空frame、複数frame、skippable frameを扱うか、未対応として確実に拒否する。

- 全入力を一chunk、frame別、1byteずつ、あらゆるsplit位置で渡し、結果が一致する。UTF-8文字やLFのchunk境界も含める。

- 先頭・本体・最後のframe・checksumで切断した入力を拒否する。展開途中までが正常JSONLかつLF終端でも成功させない。

- 後続frameの破損、末尾ごみ、1〜3byteだけの次frame magic、壊れたskippable frameを拒否する。

- `.zst`という名前のplain/gzip、未知dictionary、巨大window、上限超過を誤判定しない。

- backpressure、低速sink、取消、I/O errorでsourceとdecoderとwriterが閉じ、部分manifestを残さない。

このうち連結frameと末尾ごみは、[Node 26.10.0の公式回帰テスト](https://github.com/nodejs/node/blob/v26.10.0/test/parallel/test-zlib-reject-garbage-after-end.js#L133-L260)とも照合します。魔法のbyte列を圧縮データ内で検索してframe分割する自作回避策は採用せず、frameの終端を正しく認識するdecoderを使います。

### exportと履歴閲覧

- 圧縮主ログ、圧縮追加rollout、圧縮祖先、複数段のplain/zstd混在を保存できる。

- 参照offsetが圧縮sizeより大きくても、展開後の正しいLF境界なら成功する。UTF-8途中、行途中、EOF超過、検証可能なrecord列でのNとEの不一致は拒否する。未知recordやordinal gap等は共通validatorの未検証結果とし、raw保持と削除停止を確認する。

- 同じセッションのrevert前後の複数rolloutを落とさず、同じrolloutの物理表現は会話へ二重表示しない。

- plain/zstdの同内容・異内容・片方破損・別directory重複を区別する。

- prefix保存後にもcontainer終端を検証し、選択境界より後の会話をbundleに混入させない。

- v2を従来どおり読める。v3をチェック・検索・閲覧できる。元sourceをfixtureから外しても保存済み履歴を読める。

- disk-full、途中取消、再読hash不一致、DB更新では完了manifestと成功receiptを公開しない。

拡張先は [session-export.test.mjs](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export.test.mjs)です。既存の [Unicodeとbyte境界](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export.test.mjs#L204-L217)、[継承prefixと重複保存](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export.test.mjs#L228-L260)を圧縮版にも適用します。

### 削除と競合

- export後に同じrolloutの `.zst` が増えたら削除を止める。

- 確認後にplain→zstd、zstd→plain、追加rollout、新しいfork、同size・同mtimeでのbytes変更が起きたら止める。

- unindexed/archivedの圧縮forkも参照として発見する。decoder不在・破損・上限超過なら検査不能として止める。

- 未保存・保護された参照元を残す場合、祖先も残す。循環・対象の重複・除外の伝播を検証する。

- saved bundle、manifest、batchのいずれかの改変を検出し、古い確認tokenで新しい計画を実行しない。

- family間の途中失敗・不確実なCLI応答で自動再実行しない。完了した対象だけを正確に報告する。

- symlink、hardlink、reparse point、open前後のpath差替え、WindowsのUNC・長いパス・日本語・空白を検査する。

削除の単体・統合テストでは [既存の参照保護テスト](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.test.mjs#L439-L475)を残し、公式CLIの代役と使い捨てfixtureで、停止条件ごとの呼出し0回を検査します。加えて、対応すると宣言する実CLI版は隔離した使い捨てhomeで起動設定の伝達と副作用抑止を試験します。「圧縮未対応なので止まる」という期待値は単に削除せず、正常な対応圧縮だけが進み、不明・破損は同じく止まる条件へ分割します。

### 実装後の検証順

1. DB保全と共通lineage検証を非圧縮fixtureで単独検証し、既存の非圧縮回帰を通す。

2. 新reader単体、既知不良zstd fixture、共通境界検証とのplain/zstd同値性、v3 digestとdedup移行を検証する。

3. session-export、manage-codex-sessions、session-progress、codex入口、installerの既存テストを通し、`npm run check:agent-dev:common` と必要なWindows PowerShell側テストを実施する。

4. 対応する実CLI版の起動互換を隔離homeで検証し、`npm run check` による集約検査を通す。

5. 独立修正は既存のNode 24系で非圧縮回帰を行う。圧縮対応版は26.10.0と採用patchで圧縮試験を行い、旧Node 24互換を残す配布構成を採用した場合は、その成果物でも非圧縮回帰を行う。Windows x64・Linux x64・macOS arm64の読取・export fixture試験を行う。実CLIによる削除互換試験は既存のWindows限定範囲で行う。

[package.jsonのcheck定義](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/package.json)にはrepository独自のexport dry-runも含まれるため、検証環境は実ホームを参照しないように設定します。正常例に加え、危険入力・未検証条件・保存後の変更では削除呼出しが0回になることを必須とします。実CLI互換試験も使い捨てhomeだけを対象にし、対応版・引数・接続方式・結果を記録します。未実施の試験は成功扱いにしません。

## 段階的な導入順

**共通課題の順序と完了状態は[保全・削除の改善計画](ai-dotfiles-session-preservation-plan.md#作業順と完了条件)に従います。** DB保全の非圧縮修正は検証済みです。plain境界検証の初期subsetとCLI起動時更新の対策も実装・検証済みですが、圧縮入力への適用は圧縮削除の受入試験で別途確認します。

**第0段階は削除の防護強化。** plainと共存する圧縮版も含め、未検証の物理ファイルがある場合は削除を止めます。CLIの安全な起動設定を証明できない版・接続形態も止めます。実zstdを読む前に適用できる防護です。

**第1段階はread-onlyの圧縮対応。** 検証済みdecoder、資源制限、論理IDと物理表現のinventoryを導入します。主ログだけでなく依存元・追加rollout・参照metadataまでfixtureを通します。圧縮削除はまだ解禁しません。

**第2段階はmanifest v3のexportと閲覧。** 元形式を保持し、physical/decoded/prefixのSHAを分け、保存先から再検証できることを確認します。v2閲覧、版別digestとdedup、source変更、容量不足、未知形式を検証します。DB保全とlineage検証は独立修正の共通処理を使い、plain/zstd混在でも同じ対象範囲・結果になることを確認します。

**第3段階は検証済みexportを根拠にする圧縮削除。** batchとの結び付き、全物理集合の一致、全所有IDのDB保全・再照合、共通lineage検証、確認後再検査、起動時更新を抑止できる実CLI互換試験、実行後の結果確認が揃った時だけ有効化します。圧縮元が保存後に再圧縮された場合は、初期版では再exportを求めます。

**後の段階で検討するもの。** Node24 LTS向け外部decoder、展開JSONLへの変換保存、圧縮表現だけ変わった場合のreceipt再認証、並列decode、公式API経由の表示exportは、需要と測定結果に応じて追加します。安全な基本経路と同時に導入しないことで、検証する組合せを抑えられます。

### 作業ごとの完了条件

- [x] 第0段階：plainと共存する未検証zstdも検出し、削除CLIを呼ばずに停止する。

- [ ] 圧縮readerとmanifest v3を実装し、plain/zstd同値性、破損終端、版別digest、同契約dedup、保存物単独での閲覧を通す。

- [ ] 共通計画の起動時更新・履歴境界検証を前提に、v3の全物理一覧・参照関係・DB行を再照合し、圧縮削除の統合試験を通す。

- [ ] 全呼出元、supportFiles、help、既存checkを更新し、結果と対応版を記録する。失敗・未実施の受入条件がある機能は解禁しない。

## 公式APIを使う案との比較

人が読む履歴の取得では、公式のthread/list、metadata-only thread/read、thread/turns/list、thread/items/listを使う案もあります。[現行protocol](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1687-L1735)はpaginated履歴にpagingを推奨しています。

API案は保存形式への直接依存を減らせますが、返される投影済みのturn/itemを、生のrollout bytes・未知event・過去generationの完全保存と同一視できません。今回の元形式保持exportはファイルreaderを共通化し、将来のAPI exportは別のcoverage契約として扱うのが適切です。

app-serverを読み取りのために新規起動しても、設定に応じてmigrationやcompressionが始まる可能性があります。現行の削除CLIも同じ起動経路を使うため、[CLI起動時更新の対策](ai-dotfiles-session-preservation-plan.md#削除cliの起動時更新を抑止する)の条件はAPIへ切り替える場合に限りません。公式thread/deleteは [spawnされた子孫を含む](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/app-server/src/request_processors/thread_delete.rs#L31-L62)操作なので、APIへ切り替える場合は既存family選択・確認・削除範囲との一致も確認します。

## 実装時に確定する事項

- Node.js 26.10.0を基準にし、配布時の対応patchと旧Node 24の非圧縮互換範囲を確定する。

- 両形式共存を初期版で全面停止にするか、内容一致と全物理保存を確認して扱うか。

- 展開総量・入力総量・処理時間の具体的な上限と、利用者が明示変更できる範囲。

- 削除直前に要求する保存耐久性と、外付けdrive等での同期失敗の扱い。

- installed Codex CLIの対応版、対象homeへの接続方式、一回限りの設定上書きによる起動時更新抑止。公開mainとの静的比較だけで削除を有効化せず、隔離homeの実CLI互換試験を必須にする。

- 添付membership metadataやアプリ固有sidecarを将来どこまで保全するか。現在の参照用exportを完全復元backupと呼ばないこと。

DB保全と初期の境界検証を引き継ぎ、共通validatorの対応schema拡張や保全契約の残件は保全・削除計画に沿って進めます。圧縮側はNode.js 26.10.0を基準にします。**読めたこと、保存できたこと、削除で消える全対象を保全できたことを別々に証明する**方針を維持します。版別digest、全物理inventory、全所有IDのDB照合、安全なCLI起動を含む受入試験を通るまで、圧縮削除を解禁しません。

## 参考：圧縮機能の導入履歴

**公開コードへの導入は2026年6月1日、最初に含まれた安定版はCodex 0.137.0で、公開日は2026年6月4日です。** これはCodexのローカル履歴圧縮の履歴です。ai-dotfilesの改良で採用するNode.js 26.10.0の公開日とは別に扱います。以下の日付はUTCです。

| 日付 | 導入された範囲 | 根拠 |
| --- | --- | --- |
| 2026年6月1日 13:14 | `.jsonl.zst` の読取・探索・一覧・検索と、再開や追記前のplain JSONLへの復元 | [PR 25087](https://github.com/openai/codex/pull/25087)と[導入commit](https://github.com/openai/codex/commit/a8a6071279b6f3112fcc5fc3fee69c48473d7149) |
| 2026年6月1日 16:35 | 古いローカル履歴を圧縮するworkerを追加。初期対象はarchived_sessionsのみ、feature flagは既定OFF | [PR 25089](https://github.com/openai/codex/pull/25089)と[導入commit](https://github.com/openai/codex/commit/01cb97851b1634d33b9bbb8e184111611c39b7b5) |
| 2026年6月4日 01:17 | 上記の読取とworkerを含む最初の安定版Codex 0.137.0を公開 | [公式リリース](https://github.com/openai/codex/releases/tag/rust-v0.137.0) |
| 2026年6月16日 | 未アーカイブのcold rolloutも対象にし、sessionsを走査範囲へ追加 | [PR 28338](https://github.com/openai/codex/pull/28338) |
| 2026年8月28日と9月1日 | 圧縮された共有・fork履歴の論理offset対応を導入し、後に通常の圧縮flagへ統合 | [PR 41357](https://github.com/openai/codex/pull/41357)と[PR 42039](https://github.com/openai/codex/pull/42039) |
| 2026年9月9日 | writerとcompressorのプロセス間ロックを共有し、使用中threadとの競合対策を強化 | [PR 44138](https://github.com/openai/codex/pull/44138) |
| 2026年9月16日 | 手動で圧縮workerを要求する実験的RPC rollout/compressを追加 | [PR 46020](https://github.com/openai/codex/pull/46020) |
| 2026年10月6日時点 | 公開mainは通常のsessionsとarchived_sessionsを扱い、writerとの協調、可逆な表現切替、experimental RPCを備える | [現在の圧縮実装](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/compression.rs) |

0.137.0の公式changelogにはPR 25087と25089の両方が記載され、commitの含有も確認できます。直前の安定版0.136.0は両commitを含みません。したがって、公開コードのmerge日と安定版への収録日を分けて記録します。alpha版のtag作成や配布はこれらとも別の節目です。

導入当初のworkerは、アーカイブ済み履歴に限定され、writerと圧縮の競合が未解決であることを [PR 25089](https://github.com/openai/codex/pull/25089) 自体が明記していました。初期版の存在だけを、当時の全ユーザー向け有効化や現在と同じ保証の根拠にしません。現在のwriter lock・両rootへの対応は、上の「Codexの圧縮処理が保証すること」で説明した固定commitを基準にします。

**デスクトップアプリの「ローカルのチャット履歴を圧縮」という設定項目の初回提供日は、上記のGit履歴だけでは確定できません。** バックエンドのmerge日、CLI安定版への収録日、アプリUIの表示・段階配信日は区別し、UIの初回提供日は公開資料で確認できた場合に記録します。
