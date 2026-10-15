# @ai-dotfiles agent-dev-runtime managed
"""Read-only, allowlisted permission evidence. Python 3.11+; no third-party modules."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import tomllib

CONFIG_KEYS = ('approval_policy', 'approvals_reviewer', 'default_permissions', 'sandbox_mode', 'profile')
UUID = re.compile(r'^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')


def pick(value, keys):
    return {k: value[k] for k in keys if k in value} if isinstance(value, dict) else {}


def path_key(value):
    value = str(value).replace('\\', '/').rstrip('/')
    return value.casefold() if os.name == 'nt' else value


def read_document(path, parser):
    try:
        raw = path.read_bytes()
        return {'status': 'read', 'data': parser(raw.decode('utf-8-sig'))}
    except FileNotFoundError:
        return {'status': 'absent'}
    except PermissionError:
        return {'status': 'denied'}
    except (ValueError, UnicodeError):
        return {'status': 'invalid'}
    except OSError:
        return {'status': 'unavailable'}


def config_evidence(home, project, profile):
    paths = [home / 'config.toml']
    paths.extend(d / '.codex' / 'config.toml' for d in reversed([project, *project.parents]))
    unique = list(dict.fromkeys(paths))
    layers = []
    user_profile = None
    project_key = path_key(project)
    for path in unique:
        result = read_document(path, tomllib.loads)
        entry = {'path': str(path), 'status': result['status']}
        if result['status'] == 'read':
            c = result['data']
            entry['values'] = pick(c, CONFIG_KEYS)
            if path == home / 'config.toml':
                user_profile = c.get('profile')
            selected = profile or c.get('profile') or user_profile
            entry['profileSelection'] = {'name': selected, 'source': 'inspection-argument' if profile else 'file' if c.get('profile') else 'user-file-assumption' if user_profile else 'unavailable'}
            entry['selectedProfileValues'] = pick(c.get('profiles', {}).get(selected, {}), CONFIG_KEYS) if selected else {}
            entry['projectValues'] = next((pick(v, (*CONFIG_KEYS, 'trust_level')) for k, v in c.get('projects', {}).items() if path_key(k) == project_key), {})
            permissions = entry['selectedProfileValues'].get('default_permissions', c.get('default_permissions'))
            definition = c.get('permissions', {}).get(permissions)
            entry['permissionDefinition'] = pick(definition, ('filesystem', 'network', 'extends')) if isinstance(definition, dict) else None
            entry['windows'] = pick(c.get('windows', {}), ('sandbox',))
        layers.append(entry)
    return layers


def managed_evidence(home):
    roots = [home]
    if os.name == 'nt':
        program = Path(os.environ.get('PROGRAMDATA', 'C:/ProgramData'))
        roots.extend([program / 'Codex', program / 'OpenAI' / 'Codex'])
    else:
        roots.append(Path('/etc/codex'))
    result = []
    for root in roots:
        for name in ('requirements.toml', 'managed_config.toml'):
            path = root / name
            item = read_document(path, tomllib.loads)
            row = {'path': str(path), 'status': item['status']}
            if item['status'] == 'read':
                row['values'] = pick(item['data'], (*CONFIG_KEYS, 'allowed_approval_policies', 'allowed_approvals_reviewers', 'allowed_sandbox_modes', 'allowed_permission_profiles', 'auto_review'))
            result.append(row)
    return result


def app_evidence(home, thread):
    path = home / '.codex-global-state.json'
    item = read_document(path, json.loads)
    result = {'path': str(path), 'status': item['status']}
    if item['status'] != 'read':
        return result
    data = item['data']
    atom = data.get('electron-persisted-atom-state') if isinstance(data, dict) else None
    if not isinstance(atom, dict):
        return {**result, 'status': 'invalid'}
    result['localModes'] = {k: atom.get(k, {}).get('local') if isinstance(atom.get(k, {}), dict) else None for k in (
        'agent-mode-by-host-id', 'preferred-non-full-access-agent-mode-by-host-id', 'config-derived-agent-mode-by-host-id')}
    result['permissionSelection'] = pick(atom.get('permission-selection-by-host-id:local'), ('kind', 'profileId', 'agentMode'))
    entries = atom.get('heartbeat-thread-permissions-by-id', {})
    result['threadPermissions'] = pick(entries.get(thread) if isinstance(entries, dict) else None, ('approvalPolicy', 'approvalsReviewer', 'activePermissionProfile', 'sandboxPolicy'))
    return result


def history_evidence(home, thread=None, turn=None, project=None, recent=False):
    # Node owns bounded plain/zstd decoding and current-generation resolution.
    # No child inherits commands from archived content. The helper only reads.
    node = os.environ.get('AGENT_CODEX_PERMISSION_NODE', 'node')
    helper = Path(__file__).with_name('permission-history.mjs')
    request = {'home': str(home), 'thread': thread, 'turn': turn,
               'project': str(project) if project else None, 'recent': recent}
    try:
        result = subprocess.run([node, '--disable-warning=ExperimentalWarning', str(helper)], input=json.dumps(request),
                                encoding='utf-8', capture_output=True, timeout=55, check=False)
        if result.returncode != 0 or result.stderr:
            raise ValueError
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        if recent:
            return {'sessions': [], 'notes': ['History helper unavailable; use manual entry.']}
        return {'status': 'unavailable', 'reason': 'history-helper-failed'}


def recent_sessions(home):
    return history_evidence(home, recent=True)


def session_evidence(home, thread, turn, project):
    return history_evidence(home, thread, turn, project)


def inspect(home, project, thread=None, turn=None, profile=None):
    configs = config_evidence(home, project, profile)
    app = app_evidence(home, thread)
    session = session_evidence(home, thread, turn, project)
    findings = []
    effective = session.get('turn') or {}
    # Compare each observed layer independently: do not impersonate Codex's resolver.
    for layer in configs:
        for section in ('values', 'selectedProfileValues', 'projectValues'):
            for key in ('approval_policy', 'approvals_reviewer'):
                values = layer.get(section, {})
                if key in values and effective.get(key) is not None and values[key] != effective[key]:
                    findings.append({'kind': 'difference', 'source': layer['path'], 'section': section, 'field': key, 'configured': values[key], 'recorded': effective[key]})
    saved = app.get('threadPermissions', {})
    for a, b in [('approvalPolicy', 'approval_policy'), ('approvalsReviewer', 'approvals_reviewer')]:
        if saved.get(a) is not None and effective.get(b) is not None and saved[a] != effective[b]:
            findings.append({'kind': 'difference', 'source': 'app-thread-save', 'field': b, 'saved': saved[a], 'recorded': effective[b]})
    app_sandbox = saved.get('sandboxPolicy') or {}
    recorded_sandbox = effective.get('sandbox_policy') or {}
    for a, b in [('type', 'type'), ('writableRoots', 'writable_roots'), ('networkAccess', 'network_access'), ('excludeTmpdirEnvVar', 'exclude_tmpdir_env_var'), ('excludeSlashTmp', 'exclude_slash_tmp')]:
        if a not in app_sandbox or b not in recorded_sandbox:
            continue
        left, right = app_sandbox[a], recorded_sandbox[b]
        if a == 'type':
            left = {'workspaceWrite': 'workspace-write', 'readOnly': 'read-only', 'dangerFullAccess': 'danger-full-access', 'externalSandbox': 'external-sandbox'}.get(left, left)
        if a == 'writableRoots':
            left, right = sorted(map(path_key, left)), sorted(map(path_key, right))
        if left != right:
            findings.append({'kind': 'difference', 'source': 'app-thread-save', 'field': 'sandbox_policy.' + b, 'saved': left, 'recorded': right})
    saved_profile = (saved.get('activePermissionProfile') or {}).get('id')
    if saved_profile:
        for layer in configs:
            for section in ('values', 'selectedProfileValues'):
                configured = layer.get(section, {}).get('default_permissions')
                if configured and configured != saved_profile:
                    findings.append({'kind': 'difference', 'source': layer['path'], 'section': section, 'field': 'default_permissions-vs-app-profile', 'configured': configured, 'saved': saved_profile})
    if session.get('projectMatches') is False:
        findings.append({'kind': 'difference', 'field': 'project', 'reason': 'selected-session-belongs-to-another-project'})
    managed = managed_evidence(home)
    for item in [*configs, *managed, app, session]:
        if item['status'] not in ('read', 'absent'):
            findings.append({'kind': 'incomplete', 'source': item.get('path', 'session'), 'status': item['status']})
    if configs[0]['status'] == 'absent' or app['status'] == 'absent':
        findings.append({'kind': 'incomplete', 'reason': 'user-config-or-app-state-absent'})
    for key in ('approval_policy', 'approvals_reviewer', 'sandbox_policy', 'permission_profile'):
        if effective.get(key) is None:
            findings.append({'kind': 'incomplete', 'field': key, 'reason': 'not-recorded'})
    return {'schemaVersion': 1, 'collectedAt': datetime.now(timezone.utc).isoformat(), 'project': str(project), 'threadId': thread,
            'configFiles': configs, 'managedFileCandidates': managed, 'appSaved': app,
            'executionRecord': session, 'findings': findings,
            'uncollected': ['active Desktop feature flags and permission selection branch', 'runtime config layers and management/model requirements', 'process launch overrides', 'model-facing permission instructions', 'Desktop package version'],
            'interpretation': 'Saved choices are evidence, not proof of precedence or corruption. No changes made. Missing candidate files do not exclude other management sources.'}


def public_output(value):
    # Mask expanded home paths in all nested evidence, including object keys.
    pattern = re.compile(re.escape(str(Path.home()).replace('\\', '/')) + r'(?=/|$)', flags=re.I if os.name == 'nt' else 0)
    def mask(item):
        if isinstance(item, str):
            return pattern.sub('~', item.replace('\\', '/'))
        if isinstance(item, list):
            return [mask(v) for v in item]
        if isinstance(item, dict):
            return {mask(k): mask(v) for k, v in item.items()}
        return item
    return mask(value)


def show_text(report):
    print('Codex permissions and approvals: read-only evidence')
    print('Project: ' + report['project'])
    print('Task: ' + (report['threadId'] or 'unavailable'))
    print('\nConfig files (observed layers; precedence is not resolved):')
    for index, layer in enumerate(report['configFiles']):
        if index and layer['status'] == 'absent':
            continue
        print('  ' + layer['path'] + ': ' + layer['status'])
        for key in ('values', 'selectedProfileValues', 'projectValues'):
            if layer.get(key):
                print('    ' + key + ': ' + json.dumps(layer[key], ensure_ascii=False))
    print('  Other candidate project configs: absent unless listed above.')
    print('\nApp saved values: ' + report['appSaved']['status'])
    for key in ('localModes', 'permissionSelection'):
        print('  ' + key + ': ' + json.dumps(report['appSaved'].get(key), ensure_ascii=False))
    saved = report['appSaved'].get('threadPermissions', {})
    print('  task: ' + json.dumps(pick(saved, ('approvalPolicy', 'approvalsReviewer', 'activePermissionProfile')), ensure_ascii=False))
    record = report['executionRecord']
    detail = record.get('selection', 'recorded') if record['status'] == 'read' else record.get('reason', 'unavailable')
    print('\nExecution record: ' + record['status'] + ' (' + detail + ')')
    print('  ' + json.dumps(record.get('session'), ensure_ascii=False))
    turn = record.get('turn') or {}
    print('  ' + json.dumps(pick(turn, ('turn_id', 'timestamp', 'line', 'approval_policy', 'approvals_reviewer')), ensure_ascii=False))
    print('  sandbox: ' + json.dumps(turn.get('sandbox_policy'), ensure_ascii=False))
    print('  permission profile: ' + json.dumps(pick(turn.get('permission_profile'), ('type', 'network')), ensure_ascii=False))
    print('\nDifferences / gaps:')
    for finding in report['findings']:
        print('  ' + json.dumps(finding, ensure_ascii=False))
    for item in report['managedFileCandidates']:
        if item['status'] != 'absent':
            print('  Management candidate: ' + json.dumps(item, ensure_ascii=False))
    print('  Management candidate paths and full filesystem entries are included in --json.')
    print('\nNot collected: ' + '; '.join(report['uncollected']))
    print(report['interpretation'])


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError


def main(argv=None):
    parser = Parser(add_help=False, allow_abbrev=False)
    for name in ('thread', 'turn', 'project', 'codex-home', 'profile'):
        parser.add_argument('--' + name)
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--recent', action='store_true')
    try:
        args = parser.parse_args(argv)
        thread = args.thread or os.environ.get('CODEX_THREAD_ID')
        if (thread and not UUID.fullmatch(thread)) or (args.turn and (not thread or not UUID.fullmatch(args.turn))):
            raise ValueError
        thread = thread.lower() if thread else None
    except ValueError:
        print('Invalid arguments. Use agent codex permission help.')
        return 2
    try:
        home = Path(args.codex_home or os.environ.get('CODEX_HOME') or Path.home() / '.codex').absolute()
        if args.recent:
            print(json.dumps(public_output(recent_sessions(home)), ensure_ascii=False))
            return 0
        report = inspect(home, Path(args.project or os.getcwd()).absolute(), thread, args.turn, args.profile)
        report = public_output(report)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            show_text(report)
        # Live app evidence is not available through this file-only inspector.
        return 3
    except Exception:
        print('Inspection failed: unsupported data shape or read failure. No retry attempted.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
