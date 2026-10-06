# Codexセッションの保全・削除に関する改善計画

この文書は、ai-dotfilesのセッションexport・削除を保守する開発者向けに、圧縮対応の調査で見つかった共通課題と作業順をまとめます。現在使えるコマンドは[利用説明](../agent-codex.md)、圧縮固有の設計と受入条件は[圧縮対応計画](ai-dotfiles-compressed-session-plan.md)を参照してください。計画の記述だけで、未実装の検証や削除保護が有効になるわけではありません。

## 課題の分類と現在の状態

2026年10月6日時点の整理です。「実装済み」はこのリポジトリの実装と合成fixtureでの確認を指し、配布済みCLIへの反映や既存の保存物の完全性を保証するものではありません。

- **履歴DBの保存・照合範囲の不足：修正済み。** 非圧縮でも、セッションIDと所有rollout IDが異なると一部のDB行が対象から漏れました。合成fixtureで再現し、全所有IDとlegacy IDを対象にする修正を検証しました。
- **フォーク履歴の境界検証：未実装の強化案。** 保存するbyte範囲と履歴上の位置の対応を共通処理で検証します。非圧縮にも適用しますが、現行実装の確定不具合や実データの不整合を再現したという意味ではありません。
- **削除CLIの起動時更新：未実装の対策。** 削除用CLIが起動するbackground migration・compressionへの対処です。非圧縮の削除にも関わります。固定した公式コードから更新経路を確認していますが、配布CLIでの再現・抑止効果は未検証です。
- **plainとzstdの共存時の検査漏れ：圧縮に関係する未実装の対策。** 保存後に追加された圧縮版を見落とすコード経路への防護です。圧縮readerより先に対応できます。詳細は[圧縮計画の混在形式の検証](ai-dotfiles-compressed-session-plan.md#混在形式の検証漏れを先に塞ぐ)で管理します。
- **zstdの読取・manifest v3・圧縮削除：未実装の機能追加。** [圧縮対応計画](ai-dotfiles-compressed-session-plan.md)で管理します。

添付metadata・アプリ固有sidecarの保全範囲と、停電を考慮した保存耐久性も圧縮専用の論点ではありません。これらは後述の契約上の検討事項として扱い、確認済みの消失不具合には数えません。

## 根拠と用語

不具合調査の基準は[ai-dotfiles commit d4747236](https://github.com/peaceroad/ai-dotfiles/commit/d4747236a2d079d96dfc47d71e23783b21e6600c)、公式動作の基準は[Codex commit 822e58cc](https://github.com/openai/codex/commit/822e58cc3d666166c7446c5b1ea2e52f5d09594c)です。前者はDB修正前の比較元であり、現在の作業版を示すものではありません。公開mainの実装と、利用者が使う配布版の動作は区別します。

セッションIDは会話の安定した識別子、rollout IDは履歴世代の識別子です。revert等によって、一つのセッションが複数のrolloutを所有する場合があります。以下ではセッションIDをT、所有するrollout IDをRまたはR1・R2と書きます。フォークが参照する外部祖先は、そのセッションの所有rolloutには含めません。

## 作業順と完了条件

1. **DB保全の修正を確定する。** 実装・回帰テスト・利用説明を同じ変更単位にまとめる。この修正は圧縮readerやNode.js 26への移行に依存しない。
2. **削除前の防護を先行する。** CLI起動時更新の抑止と、未検証の圧縮siblingがある場合の停止をそれぞれ実装・検証する。安全な起動条件を確認できない版・接続方式は削除に使わない。
3. **共通の履歴境界検証を非圧縮で実装する。** 検証できる範囲、未検証時の保存・表示、削除停止を確定する。
4. **圧縮readerとv3 export・閲覧を実装する。** 共通のDB・境界検証を再利用し、plain/zstd混在の試験を追加する。
5. **圧縮削除の受入条件を満たしてから有効化する。** 対象となる全物理ファイルの保存・照合、参照保護、安全なCLI起動、実行結果の確認をそろえる。

各課題は独立した変更単位にし、完了状態は担当文書だけで管理します。この計画と圧縮計画は、実装修正とは別の文書コミットにまとめても構いません。未実装の計画をコミットすることと、機能を利用可能にすることは別の判断です。

- [x] DB保全：非圧縮の合成fixtureで所有ID集合・4テーブルの保存・変更検出・旧v2互換を検証する。
- [ ] 起動時更新：CLI代役による引数検査と、対応実CLI・隔離homeでの抑止効果を検証する。
- [ ] 履歴境界：plainの境界fixture、未検証coverage、削除停止を検証する。

## 圧縮とは独立した履歴DB保全の修正

**状態は実装・合成fixture検証済みです。非圧縮セッションにも成立する保存・照合範囲の不足を、圧縮対応から切り分けて修正しました。** 修正前の合成fixtureでは、rollout ID側のDB行が保存されず、その行だけの変更でも削除計画を通ることを再現しました。修正後は4テーブルの保存、追加・更新・削除の検出と削除呼出しの停止、複数世代とlegacy ID、外部祖先の除外、旧v2閲覧と新しい保存契約への切替を検証しています。既に削除済みの実セッションや保存先を検査した結果ではありません。

### 発生条件と影響

安定セッションIDをT、同じセッションが所有するrollout IDをRとします。revert等によってTとRが異なり、履歴DBにRをキーとする行がある場合が対象です。Codexの履歴DB投影は、列名が `thread_id` でも [immutable rollout IDをキーにする設計](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/mod.rs#L162-L166)で、[writerもrollout IDを渡します](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/live_writer.rs#L352-L360)。公式削除は [所有するrollout IDの集合を収集](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/delete_thread.rs#L30-L63)し、[legacy互換のstable thread IDも加えてDB履歴を削除](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/delete_thread.rs)します。

修正前のai-dotfilesの [DB抽出は渡された単一IDだけを検索](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-batches.mjs#L63-L86)し、[export](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L699-L712)と [削除前の再照合](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L869-L874)の両方が `reader.lines(row.id)`、つまりTを渡します。このため、Rに属する `thread_turns`、`thread_items`、`thread_realtime_items`、`thread_history_projection_state` の行が保存・照合から落ち得ます。export後から削除前照合までにRの行だけが変わり、Tの行や他の検査対象が変わらない場合、その変更をこのDB照合では検出できません。

影響は「対応する履歴DB行を保全した」「保存後のDB変更を照合した」という保証の不足です。固定commitの静的コードと合成fixtureで確認した問題です。実セッションでの消失事故を確認したものではありません。raw rolloutが完全に保存されていれば会話が必ず失われるとは言えず、Codex自身も [SQLiteを再構築可能なviewとして扱っています](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/live_writer.rs#L352-L360)。

### 実装した範囲

- 同一セッションが所有する全rollout IDとlegacy互換のstable session IDを集め、重複排除したDB対象ID集合を共通処理で作る。Tだけ、またはcurrent rolloutだけへの置換で済ませない。

- DB抽出・保存・削除前の再照合は同じ対象集合、テーブル範囲、決定的な出力順序を使う。削除前には所有集合も再取得し、保存時からの追加・消失・変更を検出して停止する。

- 独立修正の保存契約はv2を維持し、既にdigest対象のcoverageへ `indexedHistory` を追加した。内容はpolicy版 `owned-rollout-ids-v1`、ソート済み対象ID集合、対象テーブル、DBの有無、対応member名とする。memberのbytes・SHA・行数はfilesへ記録する。既存v2のdigest関数は変えず、旧bundleは閲覧可能に保つ一方、新しい保全記録がないbundleは削除の前に再exportを求める。旧bundleの閲覧と、既存v2 readerによる新bundleの検証を合成fixtureで確認済み。圧縮用v3の完成待ちにはしない。

- 外部祖先のrollout IDは、同一セッションの所有集合に混ぜない。フォークの参照元であることだけを理由に、親のDB履歴全体を追加保存しない。

- 対象は `session-export-batches.mjs` のDB抽出と、`manage-codex-sessions.mjs` のexport・削除前照合、manifestの記録・検証、および回帰テスト。圧縮decoderやruntime変更とは別の変更単位にする。

### 検証した受入条件

回帰ケースは[session-export.test.mjs](../../tools/agent/codex/session-export.test.mjs)と[manage-codex-sessions.test.mjs](../../tools/agent/codex/manage-codex-sessions.test.mjs)にあります。以下は合成データによる確認範囲です。

- 非圧縮の合成fixtureでT≠Rを作り、R側だけに4テーブルの行を置いても保存される。

- 同じTがR1・R2を所有するケースと、legacyのT行も残るケースで、対象集合に欠落・重複がない。

- export後にR側だけのDB行を追加・更新・削除した各ケースで、削除前照合が停止し、公式deleteの代役への呼出しが0回になる。

- export後に所有rollout集合が変わった場合は停止する。外部祖先の対象外DB行はbundleへ混入しない。

- 既存の非圧縮export、v2閲覧、TとRが同じlegacyケースの回帰を通す。`coverage.indexedHistory` のID・policy・memberの単独改変は検出し、記録のない旧bundleは閲覧できても新しい削除判定には通さない。圧縮対応を追加した段階では同じ試験をplain/zstd混在にも適用する。

非圧縮経路の受入条件は検証済みです。圧縮export・削除を追加する際は、このDB対象集合の規則を引き継ぎ、混在形式の試験を追加します。

## 削除CLIの起動時更新を抑止する

**削除CLI自身が、最後の照合後に履歴を更新し得る経路を先に閉じます。** 現行ai-dotfilesは [公式CLIのdeleteを呼び](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/manage-codex-sessions.mjs#L1166-L1172)、公式CLIは [app-serverを起動してからthread/deleteを実行](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/tui/src/session_archive_commands.rs#L82-L117)します。その初期化は、設定次第で [background migrationとcompressionを非同期に開始](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/core/src/thread_manager.rs#L456-L505)します。全クライアントを閉じる条件だけでは、この起動処理を防げません。

最後のinventory・SHA照合後に起動workerがplainをzstdへ変換すると、新しい物理表現を保存しないまま削除する順序があり得ます。これは静的コードで確認した設計上の不足です。再現成功や消失事故を示すものではなく、一般的な検査後の競合とは分けて対処します。

- CLI起動を共通adapterへ集約し、対応する実行ファイル・版、source-home、一回限りの設定上書き、接続方式を検査する。固定commitでは `features.local_thread_store_compression=false` と `features.background_paginated_rollout_migration=false` を `-c` で渡す方法が候補です。[overrideの読取経路](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/tui/src/session_archive_commands.rs#L237-L243)だけを根拠に、配布CLIでも効くと断定しない。

- 新規のローカルapp-server起動を基本にし、既存daemon・remoteへの暗黙接続で設定やsource-homeが変わらないことを確認する。`--no-daemon` 等の対応状況・引数順も版別に検証する。固定commitの [daemon再利用の判定](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/tui/src/daemon_startup.rs#L90-L139)は、この二つのfeature overrideを再利用許可対象にしていません。

- 利用者のconfigは恒久変更しない。対象版・接続方式で起動時更新を抑止できる証拠がなければ、plain・zstdとも削除を停止する。helpやversionの存在確認だけでは合格にしない。

- 単体試験ではCLIの代役で引数・home・未知版の拒否を確認する。互換試験では、両featureがONの使い捨てhomeにmigration対象とcoldなplain fixtureを置き、対応する実CLIで一回限りのOFF指定が有効になり、起動workerによる変換が始まらないことを観測する。未指定なら起動する対照条件も設け、削除が速く終わっただけの偽陽性を避ける。

- 実CLI互換の証拠を得られるまでは削除解禁条件を満たさない。DB・lineage・物理inventoryの検証を通ったことを、この未確認条件の代わりにしない。

## 圧縮とは独立した履歴境界の共通検証

**plainとzstdに共通する検証の実装課題です。現行コードに確定した不具合や実データの不整合が見つかったという意味ではありません。** 現行の [依存元の検査](https://github.com/peaceroad/ai-dotfiles/blob/d4747236a2d079d96dfc47d71e23783b21e6600c/tools/agent/codex/session-export-content.mjs#L67-L143)はbyte範囲、LF終端、metadataと一部のordinal関係を確認しています。「ordinal不整合を拒否する」という受入条件を実装できるよう、byte境界とordinalの対応規則をここで固定します。まず非圧縮経路で実装し、圧縮readerは展開後bytesを同じvalidatorへ渡します。

### 初期実装で検証する範囲

初期の削除判定は、**検証できる保守的な部分集合**に限定します。公式projectionは [未知record・ordinal欠落を読み飛ばし、gap・重複・逆行も区別して扱う](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/thread_history_materialization.rs#L150-L240)ため、下記の連続ordinal規則をCodex公式の全仕様とは説明しません。未知recordの数だけordinalを進めたり、単純な行数や最大ordinalで代用したりしない方針です。

1. `history_base.thread_id` は参照先rollout IDとして解決する。所有者はsession metadataとファイルidentityで照合し、正しいrevertでrollout IDとstable thread IDが異なること自体は拒否しない。曖昧な候補、循環、所有者不一致、未対応history modeを推測で通さない。

2. 参照元が指定する `end_byte_offset=N` は、[plainとzstdで共通の元JSONL byte位置](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/seekable_reader.rs#L1-L106)とする。0より大きく展開長以下、N−1がLF、先頭からNまでが完全なUTF-8とJSONLであることを確認する。CRLFのCRや空白もbytesに含め、文字数やJSON再出力から換算しない。

3. 参照先自身のhistory_baseのend ordinalをB、baseがなければB=0とする。[session_metaのordinalはB](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/ordinal.rs#L23-L51)、[その本文はB+1から](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/rollout_lineage.rs#L177-L201)として別に数える。指定EはE≥B+1を必須とし、それ未満はinvalidとする。rootのmetadata-only prefixや、E=B+1となる空の中間segmentを許可する。

4. 先頭metadataを検査した後、期待ordinalをB+1で開始し、Nまでの空白行はbyte位置だけ進める。各recordは固定した対応schemaでpayloadまで検証し、ordinalが期待値なら1進める。prefix全体を既知schemaと連続ordinalで検証できた場合は、Nに到達した時の期待値が指定された `end_ordinal_exclusive=E` と一致することを必須にする。未知のnested variantも検査対象にし、top-level typeのallow-listだけで [公式のtyped decode](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/rollout/src/lib.rs#L52-L73)と同じ結果だとみなさない。

5. offset・ordinalは元の数値表現を失わずに読み取る。初期対応は非負の10進整数tokenとJavaScriptの安全整数範囲に限定し、小数・指数表記・負数・範囲外を拒否する。加算前のoverflowも検査する。`JSON.parse` 後の `Number.isSafeInteger` だけではparse時の丸めを排除できないため、数値tokenを保持する処理を境界parserへ含める。

6. N以降のrecordはprefixのordinal判定に使わず、保存対象にも混ぜない。zstdのcontainer終端検証は別の検査として最後まで行う。prefixの一致とsource全体の正常性を別々の結果として返す。

### 結果と既存機能への適用

validatorは、policy版、参照rollout ID、N、E、B、prefixのbytes・SHA、検証結果を返す共通処理にします。名称は提案です。対応するrecordとpayload schemaはテストと同じ定義を使い、主たる依存prefixと所有追加rolloutのhistory_baseの両経路から呼びます。

- `verified`：上記のbyte・ordinal・metadata・lineage条件をすべて満たす。plain/zstdで同じ結果になることを要求する。

- `unverified`：JSONLとして保持できるが、未知record、未知payload variant、ordinal欠落・gap・重複・逆行などが保守的な対応範囲を外れる。raw bytesを変えずに参照用exportへ残せる場合は警告と部分coverageを付け、表示履歴が完全・lineage検証済みとは表示しない。削除は停止し、既存の「raw保存済みだから許可する警告」にこの警告を追加しない。

- `invalid`：UTF-8やJSONの破損、整数の表現・範囲違反、途中record、EOF超過、検証可能なrecord列でのNとEの不一致、metadata不整合・循環。完了exportや削除証明を作らない。

ordinal免除はlegacyかつhistory_baseがない既存セッションだけに限定し、従来のJSONL検査を維持します。paginatedでhistory_baseがない場合はB=0で検証し、legacyなのにhistory_baseがある入力を免除経路へ通しません。一つでも未知record・ordinal欠落・gap等を含むprefixは期待ordinalを確定できないため、単純集計した末尾値がEと違っても、それだけでinvalidへ格上げせずunverifiedを維持します。不正JSONや物理byte境界の違反があればinvalidを優先します。manifestには検証policyと結果をdigest対象のcoverageへ記録し、表示用の完全性と削除の可否を区別します。

### 境界検証の合成fixture

- root metadata 0、本文1・2、本文2のLF直後でN、E=3は成功。同じNでE=2・4は不一致。metadataだけならE=1で成功。

- B=4の参照先でmetadata 4、本文5、E=6は成功。metadataだけでE=5の [空の中間segment](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/rollout_lineage_tests.rs#L50-L103)も成功。E≤Bはinvalid。

- NがUTF-8文字途中、JSON行途中、LF直前、0、EOF超過なら拒否。日本語・CRLF・空白行は元bytesで数え、空白行でordinalを増やさない。

- 未知ordinal 1の後に既知ordinal 1が来る場合、未知行を数えて後続を重複扱いにしない。公式には [再利用を許す試験](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/thread-store/src/local/thread_history_materialization_tests.rs#L2485-L2555)がありますが、初期subsetではrawを保持した未検証結果にする。

- 未知record後に既知recordが続き、単純集計の末尾値がEと違ってもunverifiedを維持する。既知1→3のgap、1→1の重複、2→1の逆行、ordinal欠落、未知nested variantも未検証。小数・指数・負数・安全整数外・加算overflow、壊れたJSONはinvalid。

- 多段fork、正しいrevert、空segment、曖昧な候補、欠落祖先、循環、所有者不一致を分ける。欠落・曖昧な祖先は既存の部分export警告を維持し、削除は通さない。

- 同じ展開bytesをplainとzstdで与えて、N・E・prefix SHA・結果を一致させる。N以降だけを変えてもprefix判定は変わらず、壊れたzstd終端は別のsource検査で失敗する。

- 未検証・invalidを含むexportについて、削除CLIの代役への呼出しが0回になることを確認する。

## 既存の保存物と保全契約

DB修正は今後のexportと削除前照合を改善します。既に作成されたbundleへ欠けたDB行を追記したり、削除済みの元データを復元したりするものではありません。元セッションが残っている場合は新しいexportを作り、削除計画を再検証します。元セッションを削除済みの場合は、保存済みのraw rollout・追加rollout・DB行・coverageを読み取り専用で確認し、証明できる保存範囲を区別します。確認前に旧bundleを削除・上書きしません。

DBの構造検査が成功しても、削除前の全履歴が残っている証明にはなりません。exportは参照用の保存物であり、Codexへの再取り込みや完全復元を保証しないという[既存の保全契約](../notes/codex-session-management.md)を維持します。

今後確定する共通事項は次の二つです。

- **保全対象の範囲。** 現在対象外の添付membership metadataやアプリ固有sidecarをどこまで保存するか。圧縮計画の[フォーク履歴の境界と添付物](ai-dotfiles-compressed-session-plan.md#フォーク履歴の境界と添付物)に現行範囲と根拠をまとめています。外部添付payloadまで削除されると推測しないことが必要です。
- **保存耐久性。** close・再読hash・renameに加えて、どこまでsyncを削除条件にするか。圧縮計画の[同時更新と途中失敗](ai-dotfiles-compressed-session-plan.md#同時更新と途中失敗)に検討条件をまとめています。読めることと、停電後にも残ることは同じ保証ではありません。
