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
from compare import ComparisonError, compare, configured_roots, directory, MAX_ENTRIES, MAX_FILE


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
        self.env = patch.dict(os.environ)
        self.env.start()
        os.environ.pop('SKILL_DIFF_ROOT', None)
        os.environ['SKILL_DIFF_ROOTS'] = json.dumps([str(self.root)])

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def write(self, side, name, content):
        (Path(self.paths[side]) / name).write_bytes(content)

    def call(self):
        return compare(**self.paths)

    def test_core_differences_attribution_and_read_only(self):
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

    def test_core_empty_file_presence_and_no_base(self):
        self.write('upstream', 'empty', b'')
        r = compare(self.paths['local'], self.paths['upstream'])
        self.assertEqual(r['attribution'], 'unavailable_without_base')
        self.assertEqual(r['changes'][0]['status'], 'added')

    def test_core_cli_parity(self):
        self.write('upstream', 'SKILL.md', b'changed\n')
        copied = self.root/'standalone-plugin'
        shutil.copytree(SCRIPTS.parents[2], copied)
        entry = copied/'skills/compare-skill-snapshots/scripts/compare.py'
        result = subprocess.run([sys.executable, '-B', str(entry),
            self.paths['local'], self.paths['upstream'], '--base', self.paths['base']],
            capture_output=True, text=True, check=True, cwd=self.root)
        self.assertEqual(json.loads(result.stdout), self.call())

    def test_core_reject_unsafe_paths(self):
        cases = [str(self.root/'local'/'..'/'upstream'), '/', 'relative', str(self.root/'missing')]
        (self.root/'link').symlink_to(self.root/'local', target_is_directory=True)
        cases.append(str(self.root/'link'))
        for path in cases:
            with self.subTest(path=path), self.assertRaises(ComparisonError):
                compare(path, self.paths['upstream'])
        for roots in ([], ['/'], ['/.'], ['//'], ['///.']):
            with self.subTest(roots=roots), patch.dict(os.environ, {'SKILL_DIFF_ROOTS': json.dumps(roots)}), self.assertRaises(ComparisonError):
                self.call()

    def test_core_root_normalization_and_sibling_boundary(self):
        for prefix in ('/', '///'):
            for suffix in ('', '/', '/.'):
                root = prefix + str(self.root).lstrip('/') + suffix
                paths = {key: prefix + value.lstrip('/') + suffix
                         for key, value in self.paths.items()}
                for variable, value in (('SKILL_DIFF_ROOT', root),
                                        ('SKILL_DIFF_ROOTS', json.dumps([root]))):
                    with self.subTest(prefix=prefix, suffix=suffix, variable=variable), \
                         patch.dict(os.environ, {variable: value}):
                        self.assertEqual(compare(**paths)['changes'], [])
        allowed = self.root/'allowed'
        allowed.mkdir()
        sibling = self.root/'allowed-sibling'
        shutil.copytree(self.paths['local'], sibling)
        with patch.dict(os.environ, {'SKILL_DIFF_ROOTS': json.dumps([str(allowed)])}), \
             self.assertRaisesRegex(ComparisonError, 'outside configured roots'):
            compare(str(sibling), str(sibling))

    def test_core_reject_double_slash_roots_before_access(self):
        root = '/' + str(self.root)
        for variable, value in (('SKILL_DIFF_ROOT', root),
                                ('SKILL_DIFF_ROOTS', json.dumps([root]))):
            with self.subTest(variable=variable), \
                 patch.dict(os.environ, {variable: value}), \
                 patch('compare.os.open', side_effect=AssertionError('must not open ambiguous paths')), \
                 self.assertRaisesRegex(ComparisonError, 'double-slash'):
                configured_roots()
        with patch('compare.os.open', side_effect=AssertionError('must not open ambiguous paths')), \
             self.assertRaisesRegex(ComparisonError, 'exactly two slashes'):
            directory(root)

    def test_core_reject_double_slash_snapshot_arguments(self):
        for side in self.paths:
            with self.subTest(side=side), \
                 self.assertRaisesRegex(ComparisonError, 'exactly two slashes'):
                compare(**{**self.paths, side: '/' + self.paths[side]})

    def test_core_reject_link_and_special_entries(self):
        p = Path(self.paths['local'])/'bad'
        for kind in ('symlink', 'hardlink', 'fifo'):
            if kind == 'symlink': p.symlink_to(self.root/'upstream'/'SKILL.md')
            elif kind == 'hardlink': os.link(self.root/'upstream'/'SKILL.md', p)
            else: os.mkfifo(p)
            with self.subTest(kind=kind), self.assertRaises(ComparisonError): self.call()
            p.unlink()

    def test_core_limits_binary_and_truncation(self):
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

    def test_core_missing_skill_depth_and_aggregate(self):
        with patch('compare.MAX_DEPTH', 0):
            (Path(self.paths['local'])/'nested').mkdir()
            with self.assertRaises(ComparisonError): self.call()
        (Path(self.paths['local'])/'nested').rmdir()
        with patch('compare.MAX_TOTAL', 1), self.assertRaises(ComparisonError): self.call()
        (Path(self.paths['local'])/'SKILL.md').unlink()
        with self.assertRaises(ComparisonError): self.call()

    def test_core_newline_only_change(self):
        self.write('upstream', 'SKILL.md', b'original')
        item = self.call()['changes'][0]
        self.assertEqual(item['status'], 'changed')
        self.assertEqual(item['final_newline'], {'local': True, 'upstream': False})
        self.assertIn('line_separator_only_difference', item['detail'])
        self.write('upstream', 'SKILL.md', b'original\r\n')
        self.assertIn('line_separator_only_difference', self.call()['changes'][0]['detail'])

    def test_core_line_budget_includes_cr_and_unicode(self):
        for separator in ('\r', '\v', '\u2028'):
            self.write('upstream', 'SKILL.md', ('line' + separator).encode('utf-8') * 5000)
            with self.subTest(separator=repr(separator)):
                item = self.call()['changes'][0]
                self.assertIn('too_many_lines', item['detail'])
                self.assertNotIn('diff', item)

    def test_core_manifest_literal_root_expansion(self):
        copied = self.root/'standalone-plugin'
        shutil.copytree(SCRIPTS.parents[2], copied)
        config = json.loads((copied/'mcp.json').read_text())['mcpServers']['skill-diff']
        self.assertEqual(config['env'], {'SKILL_DIFF_ROOT': '${PLUGIN_DATA}/snapshots'})
        for name in ('ordinary', 'ordinary space', 'literal"quote', 'literal\\backslash', '日本語'):
            with self.subTest(name=name):
                data = self.root/name
                snapshots = data/'snapshots'
                snapshots.mkdir(parents=True)
                paths = {}
                for side, original in self.paths.items():
                    destination = snapshots/side
                    shutil.copytree(original, destination)
                    paths[side] = str(destination)
                environment = {key: value.replace('${PLUGIN_DATA}', str(data))
                               for key, value in config['env'].items()}
                # Retain the broader parent SKILL_DIFF_ROOTS to test precedence.
                with patch.dict(os.environ, environment):
                    self.assertEqual(compare(**paths)['changes'], [])
                    with self.assertRaisesRegex(ComparisonError, 'outside configured roots'):
                        self.call()
                # Existing JSON-list callers can encode the same literal paths.
                with patch.dict(os.environ, {'SKILL_DIFF_ROOTS': json.dumps([str(snapshots)])}):
                    self.assertEqual(compare(**paths)['changes'], [])

    def test_core_reject_invalid_single_root_without_fallback(self):
        for value in ('', '/', '/.', 'relative', str(self.root/'missing')):
            with self.subTest(root=repr(value)), \
                 patch.dict(os.environ, {'SKILL_DIFF_ROOT': value}), \
                 self.assertRaisesRegex(ComparisonError, 'Set SKILL_DIFF_ROOT to'):
                self.call()

    def test_core_reject_invalid_json_roots(self):
        for value in ('', 'not json', 'null', '{}', '[null]', '[]',
                      json.dumps([str(self.root) + '\0']),
                      json.dumps([str(self.root) + '\ud800'])):
            with self.subTest(roots=repr(value)), \
                 patch.dict(os.environ, {'SKILL_DIFF_ROOTS': value}), \
                 self.assertRaisesRegex(ComparisonError, 'Set SKILL_DIFF_ROOTS to'):
                self.call()
        with patch.dict(os.environ):
            os.environ.pop('SKILL_DIFF_ROOTS')
            with self.assertRaises(ComparisonError):
                self.call()

    def test_core_reject_invalid_snapshot_paths(self):
        for side in self.paths:
            for value in (self.paths[side] + '\0', self.paths[side] + '\ud800',
                          42, [], ''):
                paths = {**self.paths, side: value}
                with self.subTest(side=side, path=repr(value)), self.assertRaises(ComparisonError):
                    compare(**paths)
        for side in ('local', 'upstream'):
            with self.subTest(side=side), self.assertRaises(ComparisonError):
                compare(**{**self.paths, side: None})
        # A null optional base has always meant comparison without attribution.
        self.assertEqual(compare(**{**self.paths, 'base': None})['attribution'],
                         'unavailable_without_base')

    def test_core_cli_error_formats_and_help(self):
        copied = self.root/'standalone-plugin'
        shutil.copytree(SCRIPTS.parents[2], copied)
        entry = copied/'skills/compare-skill-snapshots/scripts/compare.py'
        command = [sys.executable, '-B', str(entry)]
        for args in ([], [self.paths['local']],
                     [self.paths['local'], self.paths['upstream'], '--unknown'],
                     [self.paths['local'], self.paths['upstream'], '--base']):
            with self.subTest(args=args):
                result = subprocess.run(command + args, capture_output=True, text=True, cwd=self.root)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, '')
                self.assertIn('usage:', result.stderr)
                self.assertIn('error:', result.stderr)
                self.assertNotIn('Traceback', result.stderr)
        for environment, local in (({}, str(self.root/'missing')),
                                   ({'SKILL_DIFF_ROOTS': 'null'}, self.paths['local'])):
            with self.subTest(environment=environment, local=local):
                result = subprocess.run(command + [local, self.paths['upstream']],
                    env={**os.environ, **environment}, capture_output=True, text=True, cwd=self.root)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, '')
                self.assertEqual(set(json.loads(result.stderr)), {'error'})
        result = subprocess.run(command + ['--help'], capture_output=True, text=True, cwd=self.root)
        self.assertEqual(result.returncode, 0)
        self.assertIn('usage:', result.stdout)
        self.assertEqual(result.stderr, '')

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
        environment.update(PLUGIN_ROOT=str(copied), PLUGIN_DATA=str(data),
                           SKILL_DIFF_ROOTS=json.dumps([str(self.root)]))
        async def run():
            # Use the prepared interpreter for the manifest's bare python3 command.
            # The manifest's literal root overrides the broader inherited JSON
            # allowlist, which must not grant access to the server.
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
