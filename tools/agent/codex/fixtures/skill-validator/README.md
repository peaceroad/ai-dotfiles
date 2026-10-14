# Public upstream validator fixtures

These files are public OpenAI source, copied byte-for-byte with LF line endings.
They are licensed under Apache-2.0; see `LICENSE.txt` and `NOTICE` here.
No installed user files or local configuration were used.

- `quick-validate-skills.py`: [openai/skills, 49f948faa9258a0c61caceaf225e179651397431](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/scripts/quick_validate.py), Git blob `0547b4041a5f58fa19892079a114a1df98286406`.
- `quick-validate-preformat.py`: [openai/codex, 7c3747941a6b664c30f1e6aa72a917fd74dc22d2](https://github.com/openai/codex/blob/7c3747941a6b664c30f1e6aa72a917fd74dc22d2/codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py), Git blob `877c9b384a56622098a4f863ac9e0a31242a3b2d`.
- `quick-validate-formatted.py`: [openai/codex, ff6aec96948b70d94983af2641a6b67c94faeff5](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py), Git blob `e27023ece4bd259ef36560e19995eec7b6a345bf`.

Tests convert each file to CRLF in a disposable synthetic home, matching the
three existing reviewed original hashes. They assert the original and patched
SHA-256 values before running apply/restore. Tests never fetch the network.

The CLI integration checks need an existing `python` with PyYAML; when absent,
those checks report an explicit skip. They emulate the interactive answer in a
child process and run only this Node manager and the public Python fixture.
They do not launch Codex or modify a real installation. The POSIX run checks
inode and mode preservation; it does not establish Windows ACL preservation,
Windows code-page behavior, or power-loss durability.
