import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'skills/compare-skill-snapshots/scripts'
sys.path.insert(0, str(SCRIPTS))
from compare import ComparisonError, compare, MAX_ENTRIES, MAX_FILE


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.paths = {}
        for key in ('local', 'upstream', 'base'):
            p = self.root / key
            p.mkdir()
            (p / 'SKILL.md').write_text('original\n')
            self.paths[key] = str(p)
        self.env = patch.dict(os.environ, {'SKILL_DIFF_ROOTS': json.dumps([str(self.root)])})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def write(self, side, name, content):
        (Path(self.paths[side]) / name).write_bytes(content)

    def call(self):
        return compare(**self.paths)

    def test_differences_attribution_and_read_only(self):
        self.write('local', 'SKILL.md', b'local edit\n')
        self.write('upstream', 'new.txt', b'new upstream\n')
        self.write('local', 'local.txt', b'local only\n')
        self.write('upstream', 'never_execute.py', b'raise RuntimeError("must not execute")\n')
        def state():
            return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in self.root.rglob('*') if p.is_file()}
        before = state()
        with patch('socket.socket', side_effect=AssertionError('network forbidden')), \
             patch('subprocess.Popen', side_effect=AssertionError('execution forbidden')):
            result = self.call()
        self.assertEqual(before, state())
        changes = {x['path']: x for x in result['changes']}
        self.assertEqual(changes['SKILL.md']['attribution'], 'local_only')
        self.assertIn('-local edit', changes['SKILL.md']['diff'])
        self.assertIn('+original', changes['SKILL.md']['diff'])
        self.assertEqual(changes['new.txt']['status'], 'added')
        self.assertEqual(changes['new.txt']['attribution'], 'upstream_only')
        self.assertEqual(changes['local.txt']['status'], 'deleted')
        self.write('upstream', 'SKILL.md', b'upstream edit\n')
        self.assertEqual(self.call()['changes'][0]['attribution'], 'both_changed')

    def test_empty_file_presence_and_no_base(self):
        self.write('upstream', 'empty', b'')
        r = compare(self.paths['local'], self.paths['upstream'])
        self.assertEqual(r['attribution'], 'unavailable_without_base')
        self.assertEqual(r['changes'][0]['status'], 'added')

    def test_cli_parity(self):
        self.write('upstream', 'SKILL.md', b'changed\n')
        copied = self.root/'standalone-plugin'
        shutil.copytree(SCRIPTS.parents[2], copied)
        entry = copied/'skills/compare-skill-snapshots/scripts/compare.py'
        result = subprocess.run([sys.executable, '-B', str(entry),
            self.paths['local'], self.paths['upstream'], '--base', self.paths['base']],
            capture_output=True, text=True, check=True, cwd=self.root)
        self.assertEqual(json.loads(result.stdout), self.call())

    def test_reject_unsafe_paths(self):
        cases = [str(self.root/'local'/'..'/'upstream'), '/', 'relative', str(self.root/'missing')]
        (self.root/'link').symlink_to(self.root/'local', target_is_directory=True)
        cases.append(str(self.root/'link'))
        for path in cases:
            with self.subTest(path=path), self.assertRaises(ComparisonError):
                compare(path, self.paths['upstream'])
        for roots in ([], ['/'], ['/.'], ['//'], ['///.']):
            with self.subTest(roots=roots), patch.dict(os.environ, {'SKILL_DIFF_ROOTS': json.dumps(roots)}), self.assertRaises(ComparisonError):
                self.call()

    def test_reject_link_and_special_entries(self):
        p = Path(self.paths['local'])/'bad'
        for kind in ('symlink', 'hardlink', 'fifo'):
            if kind == 'symlink': p.symlink_to(self.root/'upstream'/'SKILL.md')
            elif kind == 'hardlink': os.link(self.root/'upstream'/'SKILL.md', p)
            else: os.mkfifo(p)
            with self.subTest(kind=kind), self.assertRaises(ComparisonError): self.call()
            p.unlink()

    def test_limits_binary_and_truncation(self):
        self.write('upstream', 'big', b'x'*(MAX_FILE+1))
        self.write('local', 'big', b'x'*(MAX_FILE+1))
        self.write('upstream', 'binary', b'\0x')
        self.write('upstream', 'SKILL.md', b'x'*40000)
        changes = {x['path']: x for x in self.call()['changes']}
        self.assertEqual(changes['big']['status'], 'uncompared')
        self.assertEqual(changes['big']['attribution'], 'unknown')
        self.assertIn('binary', changes['binary']['detail'])
        self.assertTrue(changes['SKILL.md']['diff_truncated'])
        for i in range(MAX_ENTRIES): self.write('local', f'file{i}', b'')
        with self.assertRaises(ComparisonError): self.call()

    def test_missing_skill_depth_and_aggregate(self):
        with patch('compare.MAX_DEPTH', 0):
            (Path(self.paths['local'])/'nested').mkdir()
            with self.assertRaises(ComparisonError): self.call()
        (Path(self.paths['local'])/'nested').rmdir()
        with patch('compare.MAX_TOTAL', 1), self.assertRaises(ComparisonError): self.call()
        (Path(self.paths['local'])/'SKILL.md').unlink()
        with self.assertRaises(ComparisonError): self.call()

    def test_newline_only_change(self):
        self.write('upstream', 'SKILL.md', b'original')
        item = self.call()['changes'][0]
        self.assertEqual(item['status'], 'changed')
        self.assertEqual(item['final_newline'], {'local': True, 'upstream': False})
        self.assertIn('line_separator_only_difference', item['detail'])
        self.write('upstream', 'SKILL.md', b'original\r\n')
        self.assertIn('line_separator_only_difference', self.call()['changes'][0]['detail'])

    def test_line_budget_includes_cr_and_unicode(self):
        for separator in ('\r', '\v', '\u2028'):
            self.write('upstream', 'SKILL.md', ('line' + separator).encode('utf-8') * 5000)
            with self.subTest(separator=repr(separator)):
                item = self.call()['changes'][0]
                self.assertIn('too_many_lines', item['detail'])
                self.assertNotIn('diff', item)

    @unittest.skipUnless(importlib.util.find_spec('mcp'), 'optional MCP SDK is not installed')
    def test_mcp_stdio_parity_and_error(self):
        from mcp import Client, StdioServerParameters
        self.write('upstream', 'SKILL.md', b'upstream edit\n')
        copied = self.root/'standalone-plugin'
        shutil.copytree(SCRIPTS.parents[2], copied)
        data = self.root/'plugin data'
        snapshots = data/'snapshots'
        snapshots.mkdir(parents=True)
        paths = {}
        for side, original in self.paths.items():
            destination = snapshots/side
            shutil.copytree(original, destination)
            paths[side] = str(destination)
        expected = self.call()
        before = {str(p.relative_to(snapshots)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in snapshots.rglob('*') if p.is_file()}
        config = json.loads((copied/'mcp.json').read_text())['mcpServers']['skill-diff']
        self.assertEqual(config['type'], 'stdio')
        self.assertEqual(config['command'], 'python3')
        def expand(value):
            return value.replace('${PLUGIN_ROOT}', str(copied)).replace('${PLUGIN_DATA}', str(data))
        environment = {key: expand(value) for key, value in config.get('env', {}).items()}
        environment.update(PLUGIN_ROOT=str(copied), PLUGIN_DATA=str(data))
        async def run():
            # Use the prepared interpreter for the manifest's bare python3 command.
            # Only the manifest's roots are passed; the broader parent-only roots
            # must not grant access to the server.
            params = StdioServerParameters(command=sys.executable,
                args=[expand(arg) for arg in config['args']], cwd=expand(config['cwd']),
                env=environment)
            async with Client(params, read_timeout_seconds=30) as client:
                listed = await client.list_tools()
                self.assertEqual([t.name for t in listed.tools], ['compare_skill'])
                annotations = listed.tools[0].annotations
                self.assertIsNotNone(annotations)
                self.assertIs(annotations.read_only_hint, True)
                self.assertIs(annotations.destructive_hint, False)
                self.assertIs(annotations.idempotent_hint, True)
                self.assertIs(annotations.open_world_hint, False)
                result = await client.call_tool('compare_skill', paths)
                self.assertFalse(result.is_error)
                self.assertEqual(json.loads(result.content[0].text), expected)
                self.assertEqual(result.structured_content, expected)
                error = await client.call_tool('compare_skill', self.paths)
                self.assertTrue(error.is_error)
                self.assertIn('outside configured roots', error.content[0].text)
        asyncio.run(run())
        after = {str(p.relative_to(snapshots)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in snapshots.rglob('*') if p.is_file()}
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
