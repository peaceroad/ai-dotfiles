`skills-manifest.json` は、管理対象のスキルについて「どの取得元の、どの版を採用し、どのファイルを配置したか」を記録する台帳です。更新時の差分確認と、別環境で同じ内容を再現するために使います。

このガイドは `dot-setup.md` で定めた独自形式 `schema_version: 3` を説明します。Agent Skills や Agent Plugins が定める標準ファイルではありません。形式の正本は `dot-setup.md`、現在の採用状態は `skills/skills-manifest.json`、日常のスキル選択と読み込み先は `skills/INDEX.md` に分けます。

## 1 各ファイルの役割

### スキルの定義

Agent Skills は、スキルのディレクトリと、その入口になる `SKILL.md` を定めています。`SKILL.md` は YAML frontmatter と Markdown 本文で構成され、名前と説明などを持ちます。採用先のファイル一覧や検証結果を記録する共通台帳は、この仕様の対象ではありません。[Agent Skills specification](https://agentskills.io/specification)

```text
example-skill/
├── SKILL.md
├── references/
│   └── guide.md
└── scripts/
    └── check.py
```

### プラグインの定義

Agent Plugins の `plugin.json` は、配布するプラグインの名前や版などを記述するファイルです。標準のスキル配置先はプラグイン内の `skills/` です。この台帳の `sources` や `files` を、そのまま `plugin.json` の項目として追加しません。[Agent Plugins specification](https://agent-plugins.org/specification)

### 採用状態と内容の固定

この `skills-manifest.json` は、利用側で採用した内容を記録します。採用版を固定する lockfile に近い役割も持ちますが、他のツールの lockfile と互換ではありません。

参考として、Vercel の Skills CLI には `skills-lock.json` があり、取得元、参照名、スキルのパス、内容ハッシュなどを保持します。確認した実装は差分を安定させるため名前順で出力し、時刻を持たない設計です。ただし、ハッシュの作り方は本形式と異なるため、`computedHash` を `sha256_tree` に転記できません。[参照した固定コミットの実装](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/local-lock.ts)

## 2 保存場所と相対パス

次は、採用後のdot環境で使うファイルの配置例です。リポジトリ内の配布用ディレクトリとは異なります。`shared` の実際の場所は環境ごとに確認します。

```text
shared/
├── projects/
│   └── dot-config/
│       ├── AGENTS.md
│       ├── dot-setup.md
│       ├── dot-setup-private.md
│       └── skills-manifest-guide.md  # 任意の説明資料
├── downloads/
│   └── example-skills-source/
│       └── skills/example-skill/SKILL.md
└── skills/
    ├── INDEX.md
    ├── skills-manifest.json
    └── example-skill/
        └── SKILL.md
```

パスの基準点は次のように使い分けます。

- `canonical_instructions`、`source_root`、`receipt_path`、`artifact_path` は、manifest のあるディレクトリが基準です。`../projects/...` や `../downloads/...` は、解決後も実際の `shared` 内に収まる場合に使えます

- `source_path` は取得元リポジトリのルートが基準です。スキルのフォルダを指定し、末尾に `SKILL.md` を付けません。リポジトリ直下がスキルのルートなら `.` を指定します。

- `managed_path` と `files[].relative_path` は管理コピーのルートが基準です。現行形式の `managed_root` は `.` 固定です

後半の3種類のパスには `/` を使い、絶対パス、空の要素、`.`、`..`、改行を含めません。ただし `source_path` 全体が `.` の場合だけ、リポジトリ直下を表すものとして認めます。`./skills/example-skill` のような書き方や、他の項目での `.` は認めません。`managed_path` はスキル名と同じ1階層のディレクトリ名です。リンクの解決先も許可範囲内に収まることを確認します。

たとえば、`example-skill/references/guide.md` の取得元は、そのスキルの `source_id` で選んだリポジトリとコミットの中の、`source_path` に `references/guide.md` を加えた位置です。 `source_path` が `.` の場合は、リポジトリ直下の `references/guide.md` が取得元です。

## 3 1スキルを記録する記入例

以下は、`SKILL.md` だけで構成される架空のスキルを使った記入用テンプレートです。JSON の構文は有効ですが、`REPLACE_...` は実測値などへの置換が必要で、このままでは schema 3 の完成済み記録として使えません。ハッシュ、コミット、日時、比較結果を例示用の値で埋めて検証済みにしないでください。

この例の件数と空配列は、「1ファイルを比較し、差分がなかった」場合の記入位置を示しています。実際の比較結果に必ず置き換えます。ファイルが増える場合は、`files` と件数と全体ハッシュを一緒に更新します。

```json
{
  "schema_version": 3,
  "created_at": "REPLACE_ACTUAL_CREATION_TIMESTAMP",
  "verified_at": "REPLACE_ACTUAL_VERIFICATION_TIMESTAMP",
  "managed_root": ".",
  "canonical_instructions": "../projects/dot-config/AGENTS.md",
  "sources": [
    {
      "id": "example-source",
      "repository_url": "https://github.com/example-org/example-skills",
      "visibility": "public",
      "requested_branch": "main",
      "resolved_commit": "REPLACE_ACTUAL_40_LOWERCASE_HEX_COMMIT",
      "source_type": "selected-scope source snapshot",
      "source_root": "../downloads/example-skills-source",
      "acquired_and_verified_at": "REPLACE_ACTUAL_ACQUISITION_VERIFICATION_TIMESTAMP",
      "git_history": false,
      "git_checkout": false
    }
  ],
  "skills": [
    {
      "name": "example-skill",
      "source_id": "example-source",
      "source_path": "skills/example-skill",
      "managed_path": "example-skill",
      "upstream_relationship": "matches_upstream",
      "intentional_changes": []
    }
  ],
  "files": [
    {
      "relative_path": "example-skill/SKILL.md",
      "size": 0,
      "sha256": "REPLACE_ACTUAL_64_LOWERCASE_HEX_FILE_SHA256"
    }
  ],
  "sha256_tree": "REPLACE_ACTUAL_64_LOWERCASE_HEX_TREE_SHA256",
  "tree_hash_algorithm": "Hash raw file bytes with SHA-256. Sort files by UTF-8 bytes of slash-separated relative_path. Concatenate lowercase hex SHA-256 + two ASCII spaces + relative_path + LF; hash the resulting UTF-8 bytes with SHA-256. Include every file under selected managed_path directories; exclude root INDEX.md and skills-manifest.json.",
  "verification": {
    "skill_count": 1,
    "managed_file_count": 1,
    "source_to_managed_byte_equality_checked": 1,
    "mismatches": [],
    "missing_files": [],
    "extra_managed_files": [],
    "verification_exclusions": [
      "Runtime behavior and functional tests",
      "Automatic catalog discovery and loading",
      "External URL availability",
      "Persistence across restart or environment replacement"
    ]
  }
}
```

`size: 0` も記入位置を示す仮の値です。実際の `SKILL.md` のバイト数に置き換えます。このテンプレートを既存台帳全体に上書きせず、既存の取得元・スキル・ファイルを保持したうえで、対象レコードを追加または更新します。

## 4 フィールドの読み方

### ルート

以下はすべて必須です。

- `schema_version`：整数の `3`

- `created_at`：この環境で manifest を最初に作成した日時。タイムゾーン付き ISO 8601 文字列

- `verified_at`：記録した比較を実際に実施した日時。同じくタイムゾーン付き ISO 8601 文字列

- `managed_root`：文字列の `.`

- `canonical_instructions`：正本の `AGENTS.md` への相対パス

- `sources`、`skills`、`files`：それぞれ後述の配列

- `sha256_tree`：全管理コピーを対象とする内容ハッシュ

- `tree_hash_algorithm`：計算方法を記述する文字列

- `verification`：実施した比較の結果

`schema_version` は台帳の形式番号であり、スキルやプラグインのリリース番号とは別です。対応する JSON Schema を用意していない状態で、他の標準仕様の `$schema` URL を付け足しません。

日時を書き換えるだけで再検証したことにはできません。未検証の新規草稿を作るときは、正式な台帳として採用せず、実測が必要な項目を明示した別の草稿として扱います。

### sources

1要素が、採用する取得元と版を表します。

必須の文字列は `id`、`repository_url`、`visibility`、`requested_branch`、`resolved_commit`、`source_type`、`source_root`、`acquired_and_verified_at` です。必須の真偽値は `git_history` と `git_checkout` です。

- `id`：台帳内で一意の取得元識別子。`skills[].source_id` から参照します

- `repository_url`：取得元リポジトリ。資格情報を含む URL は保存しません

- `visibility`：`public` または `private`。共有許可を表す値ではありません

- `requested_branch`：取得時に指定したブランチ

- `resolved_commit`：採用した40桁の小文字16進 Git コミット ID

- `source_type`：取得形態を説明する文字列。列挙型ではありません。たとえば `selected-scope source snapshot` は、選んだ範囲だけを保存したソースを表します

- `git_history`、`git_checkout`：履歴を取得した場合だけ `git_history` を `true`、実際の Git 作業コピーである場合だけ `git_checkout` を `true` にします。`git_history: true` は全履歴の取得を保証しません。履歴のないスナップショットなら両方 `false` です

- `source_root`：保存した取得元のルートへの相対パス

- `acquired_and_verified_at`：取得物を確認した実際の日時。タイムゾーン付きISO 8601文字列

任意項目は `head_resolved_at`、および組で記録する `receipt_path` と `receipt_sha256` です。`head_resolved_at` はブランチ HEAD を解決した実際の日時を、タイムゾーン付きISO 8601文字列で記録します。取得記録を参照しない場合は、`receipt_path` と `receipt_sha256` の両方を省略します。

本形式は、固定コミットを取得できる Git リポジトリを対象にしています。コミットを確認できないアーカイブに、推定したコミット ID を付けて当てはめません。 選択スキルの管理ディレクトリ外に実行時の必須ファイルが必要な場合も、この記録だけでは再現できません。対象を保留し、自己完結する取得元または明示的に合意した配置方法を確認します。

### skills

各要素は必須の文字列 `name`、`source_id`、`source_path`、`managed_path`、`upstream_relationship` と、必須の配列 `intentional_changes` で構成します。

`name` は一意とし、`source_id` は存在する取得元を参照させます。`managed_path` と `name` を一致させ、直下に `SKILL.md` を置きます。スキル自体の名前や frontmatter は Agent Skills の仕様に照らして別途確認します。

`upstream_relationship` は次の3値です。

- `matches_upstream`：記録した上流コミットの対象内容と一致。`intentional_changes` は空配列

- `intentionally_modified`：意図した変更あり。空ではない `intentional_changes` に、説明と再現に必要な変更物を記録。変更物を確保できていない間は `unverified_or_unresolved`

- `unverified_or_unresolved`：未検証、または未解決の差分あり。完了扱いにしない

変更物の各要素には、`description`、`format`、`artifact_path`、`artifact_sha256`、`apply_instructions` をすべて文字列で記録します。`format` は `patch` または `skill-snapshot` です。

### files と全体ハッシュ

`files` の各要素には `relative_path`、`size`、`sha256` を記録します。`size` は非負整数のバイト数です。SHA-256 は64桁の小文字16進数を使います。

選択した各スキルの中の全ファイルを列挙し、同じパスを重複させません。各ファイルは、ちょうど1つの選択スキルに属する必要があります。管理ルート直下の `INDEX.md` と `skills-manifest.json` は対象外です。

`sha256_tree` はファイルのパスと内容をまとめて比較するための値です。JSON のキー順や空白を変えても、対象ファイルが同じなら変わりません。

### verification

以下をすべて記録します。

- 非負整数：`skill_count`、`managed_file_count`、`source_to_managed_byte_equality_checked`

- 文字列の配列：`mismatches`、`missing_files`、`extra_managed_files`、`verification_exclusions`

`skill_count` と `managed_file_count` は、それぞれ `skills` と `files` の要素数です。`source_to_managed_byte_equality_checked` は、記録した上流のバイト列と管理コピーを実際に比較した、重複しないファイル対の数です。一致数や再試行回数を意味しません。意図した追加ファイルには対応する上流ファイルがないため、管理ファイル数より小さくなる場合があります。変更物を適用した採用内容に対する全ファイルの照合と不足・余剰の確認は、別途行います。

差分の3配列には、意図した採用内容に対する問題のパスと内容を書きます。承認済みの変更物によって説明・再現できる上流との差分を、未解決の不一致として混ぜません。`verification_exclusions` には、実行時の動作、外部 URL など、今回確認していない事項を具体的に書きます。 必須の確認を省略した場合は、除外事項に記録しても完了扱いにしません。

## 5 値を決める順序

### 利用者が指定するもの

取得元、ブランチまたは固定版、対象スキル、採用する変更の範囲を決めます。`id` は一意の安定した識別子として付け、`source_path` は実際の取得元構造に合わせます。

### 取得時に確認するもの

新規取得や上流更新では、指定ブランチの HEAD をリポジトリごとに1回だけコミットへ解決します。以後、その操作中は同じコミットを使います。すでに固定コミットを指定している場合は、そのコミットを使います。

既存の Git 作業コピーで採用コミットと未コミット変更を調べる読み取り例です。`/path/to/source` は実在する取得元に置き換えます。

```bash
git -C /path/to/source rev-parse --verify 'HEAD^{commit}'
git -C /path/to/source status --short
```

`HEAD` が分かっても、未コミット変更のない上流そのものだとは限りません。また、Git メタデータを含まないスナップショットには、このコマンドを使いません。取得時のコミット指定と取得記録などを確認します。

### 配置後に計算するもの

ファイル一覧、バイト数、ファイルごとの SHA-256、全体ハッシュ、実際の比較件数と差分を取得します。状態値は結果を見て決めます。取得・検証日時は、対応する作業を実施した時刻を記録します。

出力順は `sources` を `id`、`skills` を `name`、`files` を `relative_path` の UTF-8 バイト順にそろえます。`intentional_changes` は適用順に意味があるため、名前順に並べ替えません。

## 6 ハッシュを計算する方法

ファイルは保存されている生のバイト列から計算します。改行コード、文字コード、BOM を整えてから計算すると、採用した内容とは別の値になります。

全体ハッシュは次の順序で計算します。

1. 対象ファイルを `relative_path` の UTF-8 バイト順で並べる

2. 各行を「小文字 SHA-256、ASCII の空白2個、相対パス、LF」の形にする

3. 全行を結合した UTF-8 バイト列の SHA-256 を計算する

次は、manifest がある管理ルートをカレントディレクトリとして実行する読み取り専用の計算例です。Python 3 がある環境向けで、追加パッケージは不要です。記録されたファイルの実体を読み、再計算値を表示します。manifest やファイルを書き換えません。

```python
from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
manifest = json.loads((root / "skills-manifest.json").read_text("utf-8"))
rows = []
seen = set()
for entry in manifest["files"]:
    relative = entry["relative_path"]
    parts = relative.split("/")
    if Path(relative).is_absolute() or Path(relative).drive:
        raise ValueError(f"Absolute path is not allowed: {relative!r}")
    if not relative or "\n" in relative or "\r" in relative or "\\" in relative:
        raise ValueError(f"Unsupported path: {relative!r}")
    if any(part in ("", ".", "..") for part in parts) or relative in seen:
        raise ValueError(f"Invalid or duplicate path: {relative!r}")
    seen.add(relative)
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise ValueError(f"Review symbolic link separately: {relative}")
    if not path.is_file():
        raise ValueError(f"Missing regular file: {relative}")
    data = path.read_bytes()
    rows.append({"relative_path": relative, "size": len(data),
                 "sha256": hashlib.sha256(data).hexdigest()})
rows.sort(key=lambda row: row["relative_path"].encode("utf-8"))
payload = "".join(f'{r["sha256"]}  {r["relative_path"]}\n' for r in rows)
print(json.dumps({"files": rows,
                  "sha256_tree": hashlib.sha256(payload.encode("utf-8")).hexdigest()},
                 ensure_ascii=False, indent=2))
```

これは計算法の例で、完全な検証器ではありません。原因不明の変更がある実ファイルから期待値を作り直し、台帳を一致させて検証を通す使い方はしません。記録から漏れた余剰ファイル、取得元との一致、内部参照、変更物の復元可能性は確認しません。この出力だけで `verified_at` や検証結果を更新しないでください。

ハッシュ一致が示すのは、対象範囲のパスとファイル内容の一致です。取得元の真正性や安全性を保証する署名ではありません。実行権限、所有者、リンク種別、空ディレクトリなども現在の `files` では表現しません。それらが必要なスキルは別途復元・確認し、ファイル内容の一致だけで実行環境まで再現できたと報告しません。

## 7 意図した変更を残す例

取得元から変えたことを説明するだけでは再現できません。固定コミットに適用できる patch、または変更後スキル全体を含む単一アーカイブを、manifest と一緒に渡せるようにします。

以下は `skills` の1要素の記入例です。変更物のパスと説明は例示で、ハッシュは実測値への置換が必要です。

```json
{
  "name": "example-skill",
  "source_id": "example-source",
  "source_path": "skills/example-skill",
  "managed_path": "example-skill",
  "upstream_relationship": "intentionally_modified",
  "intentional_changes": [
    {
      "description": "説明を調整し、参照ファイルを追加する",
      "format": "patch",
      "artifact_path": "../projects/dot-config/restoration/example-skill.patch",
      "artifact_sha256": "REPLACE_ACTUAL_64_LOWERCASE_HEX_ARTIFACT_SHA256",
      "apply_instructions": "既存の Git 作業ツリーの外に、記録したコミットから example-skill の作業用コピーを用意し、そのルートをカレントディレクトリにする。patch のパスは a/ または b/ から始まり、その後はスキルルートからの相対パスとする。artifact_path を解決した検証済みファイルを PATCH に指定し、git apply --check -p1 \"$PATCH\" が成功した後に git apply -p1 \"$PATCH\" を実行する。配列順に適用し、このスキルに対応する files の項目と不足・余剰を照合する。すべてのスキルの復元後に、manifest 全体の files と sha256_tree を照合する。"
    }
  ]
}
```

この例は Git 形式の patch を想定し、`-p1` で先頭の `a/` または `b/` を除きます。`PATCH` は実際に確認したファイルのパスに設定します。別形式の変更物には、その形式に合う適用場所、コマンド、順序を書きます。既存の管理コピーへ直接試さず、作業用コピーで適用と照合を終えてから採用します。

`skill-snapshot` の場合は、アーカイブの内部構造と展開先を明記します。古いファイルへ単に上書きする方法では、削除済みファイルが残る可能性があります。空の作業用コピーへ展開してから照合するなど、削除も含めて再現できる手順を記録します。

意図した変更があるスキルでは、記録した上流コミットに変更物を適用した内容を比較基準にします。その基準どおりに配置できていれば、`mismatches`、`missing_files`、`extra_managed_files` は空にできます。復元できない変更や説明のない差分が残る間は、完了扱いにしません。

## 8 更新と固定版の再現

### 新しい上流を採用する

1. 指定された更新範囲と既存のローカル変更を確認する

2. 新しいコミットを確定し、必要なスキルと依存ファイルを取得する

3. 既存の採用内容と比較し、追加・変更・削除を確認する

4. 意図した変更を保持・調整し、解消できない競合だけ確認する

5. 全対象の配置と検証が終わってから、現在の台帳を更新する

途中で失敗したら、すでに確定したコミットから再開します。再試行のたびに最新 HEAD を取り直すと、異なる版が混ざります。

### 同じ内容を別環境へ再現する

1. manifest、正本の指示文書、固定コミットへのアクセス、必要な変更物を用意する

2. 新環境の `shared` と配置先を確認し、環境依存の相対パスを組み直す

3. `resolved_commit` の対象スキルを取得する。現在のブランチ先頭へ置き換えない

4. 変更物の SHA-256 を確認し、記録順に適用する

5. 全管理ファイルについて、一覧の不足・余剰、バイト数、SHA-256、全体ハッシュを照合する

6. 各 `SKILL.md` と必要な内部参照を確認する

7. 新環境での実際の日時、比較件数、差分、検証除外事項を記録する

取得記録を使う場合はそのハッシュも照合します。ただし、取得記録が手元にないことだけを理由に再現を止めません。固定コミットを取得でき、変更物を確保でき、全ファイルを照合できるなら再現を進められます。

版の固定と、取得物を後から入手できることは別です。元のリポジトリが削除された場合やアクセスできない場合に備え、許可範囲内で必要な取得物と変更物を保持します。ハッシュ値だけでは内容を復元できません。

## 9 保存前の確認

- 形式番号を認識でき、必須フィールドと型がそろっている

- ID、スキル名、ファイルパスに重複がなく、参照先の取得元が存在する

- 相対パスの基準点が正しく、解決後も許可範囲内に収まる

- 各スキルの入口と必要な参照ファイルが存在する

- `files` が採用した管理コピーの全ファイルを表し、不足・余剰がない

- ハッシュ、件数、日時、状態値が実際の検証結果と一致する

- 意図した変更を、添付する変更物から再現できる

- `INDEX.md` のスキル一覧と配置先が一致する

- 保存後に JSON を読み直し、正しい内容が保存されたことを確認した

## 10 非公開の台帳と公開用ガイド

実際の manifest は非公開を既定にします。リポジトリ名、スキル名、ローカル構造、取得記録、変更物の説明から、非公開の活動や内容が分かる場合があります。

公開する説明には、このガイドのような架空の取得元と記入例を使います。実物を共有する場合は、URL だけでなく、`sources`、`skills`、`files`、変更物、取得記録を含めて確認します。非公開項目を削った抜粋は、そのまま完全な再現用 manifest とは呼びません。

ファイルを保存しただけでは、自動読み込み、プラグイン登録、スクリプト実行、インストール、権限付与は行われません。必要な作業は、対象環境と許可範囲を確認して別途実施します。

