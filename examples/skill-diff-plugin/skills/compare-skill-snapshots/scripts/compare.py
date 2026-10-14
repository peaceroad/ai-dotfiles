"""Bounded, read-only POSIX snapshot comparator. No code from inputs is executed."""
import argparse
import difflib
import json
import os
import stat
import sys

MAX_ENTRIES = 512
MAX_DEPTH = 32
MAX_FILE = 65536
MAX_TOTAL = 2 * 1024 * 1024
MAX_DIFF = 32768


class ComparisonError(ValueError):
    pass


def normalized_path(path):
    path = os.path.normpath(path)
    # POSIX permits implementation-defined semantics for exactly two leading
    # slashes. Descriptor walking from / cannot preserve those semantics.
    if path.startswith('//'):
        raise ComparisonError('Paths beginning with exactly two slashes are not supported')
    return path


def directory(path):
    """Open every absolute path component without following links, including ancestors."""
    if '\0' in path:
        raise ComparisonError('Paths must not contain NUL characters')
    try:
        os.fsencode(path)
    except UnicodeError:
        raise ComparisonError('Path cannot be encoded for this filesystem') from None
    if not os.path.isabs(path) or '..' in path.split('/'):
        raise ComparisonError('Expected an absolute path without parent traversal')
    path = normalized_path(path)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.split('/'):
            if part and part != '.':
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def snapshot(path, roots):
    if not isinstance(path, str) or len(path) > 4096:
        raise ComparisonError('Invalid snapshot path')
    if not os.path.isabs(path) or '..' in path.split('/'):
        raise ComparisonError('Expected an absolute path without parent traversal')
    path = normalized_path(path)
    if not any(os.path.commonpath([root, path]) == root for root in roots):
        raise ComparisonError('Snapshot is outside configured roots')
    files = {}
    count = total = 0

    def walk(fd, prefix='', depth=0):
        nonlocal count, total
        if depth > MAX_DEPTH:
            raise ComparisonError('Snapshot depth limit exceeded')
        # scandir is streamed: never materialize an unbounded directory listing.
        with os.scandir(fd) as entries:
            for entry in entries:
                count += 1
                if count > MAX_ENTRIES:
                    raise ComparisonError('Snapshot entry limit exceeded')
                name = prefix + entry.name
                if len(name) > 2048:
                    raise ComparisonError('Relative path limit exceeded')
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                    try:
                        walk(child, name + '/', depth + 1)
                    finally:
                        os.close(child)
                elif stat.S_ISREG(info.st_mode):
                    child = os.open(entry.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                    try:
                        before = os.fstat(child)
                        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                            raise ComparisonError('Special files and hard links are not accepted')
                        if before.st_size > MAX_FILE:
                            files[name] = None
                            continue
                        with os.fdopen(os.dup(child), 'rb') as stream:
                            data = stream.read(MAX_FILE + 1)
                        after = os.fstat(child)
                        if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                            raise ComparisonError('Snapshot changed while reading')
                        if len(data) > MAX_FILE:
                            raise ComparisonError('Snapshot changed while reading')
                        total += len(data)
                        if total > MAX_TOTAL:
                            raise ComparisonError('Snapshot byte limit exceeded')
                        files[name] = data
                    finally:
                        os.close(child)
                else:
                    raise ComparisonError('Symlinks and special files are not accepted')
    fd = directory(path)
    try:
        walk(fd)
    finally:
        os.close(fd)
    if 'SKILL.md' not in files:
        raise ComparisonError('Each snapshot must be one skill directory containing SKILL.md')
    return files


def configured_roots():
    # A literal path survives client placeholder expansion without nested JSON
    # escaping. Presence takes precedence, even if invalid: never fall back to a
    # broader inherited allowlist when a host explicitly selects one root.
    single = 'SKILL_DIFF_ROOT' in os.environ
    try:
        roots = [os.environ['SKILL_DIFF_ROOT']] if single else json.loads(os.environ.get('SKILL_DIFF_ROOTS', '[]'))
        if not isinstance(roots, list) or not roots or len(roots) > 16:
            raise ValueError()
        for root in roots:
            if not isinstance(root, str) or len(root) > 4096 or os.path.normpath(root).strip('/') == '':
                raise ValueError()
            fd = directory(root)
            os.close(fd)
        return [normalized_path(root) for root in roots]
    except (OSError, ValueError, TypeError):
        if single:
            raise ComparisonError('Set SKILL_DIFF_ROOT to an existing, absolute, non-root directory without symlinks or a double-slash prefix') from None
        raise ComparisonError('Set SKILL_DIFF_ROOTS to a JSON list of existing, absolute, non-root directories without symlinks or double-slash prefixes') from None


def compare(local, upstream, base=None):
    """Return changes from local to upstream; optional base attributes byte changes only."""
    try:
        roots = configured_roots()
        left, right = snapshot(local, roots), snapshot(upstream, roots)
        ancestor = snapshot(base, roots) if base is not None else None
    except OSError:
        raise ComparisonError('Cannot safely read snapshot; check permissions, paths and file types') from None
    changes = []
    remaining = MAX_DIFF
    for name in sorted(set(left) | set(right)):
        a, b = left.get(name, b''), right.get(name, b'')
        unknown = (name in left and a is None) or (name in right and b is None)
        if name in left and name in right and not unknown and a == b:
            continue
        status = 'added' if name not in left else 'deleted' if name not in right else 'uncompared' if unknown else 'changed'
        item = {'path': name, 'status': status}
        if ancestor is not None:
            c = ancestor.get(name, b'')
            if unknown or (name in ancestor and c is None):
                item['attribution'] = 'unknown'
            else:
                # Presence is distinct from an empty file.
                l = (name in left, a) != (name in ancestor, c)
                u = (name in right, b) != (name in ancestor, c)
                item['attribution'] = 'both_changed' if l and u else 'local_only' if l else 'upstream_only' if u else 'neither'
        if unknown:
            item['detail'] = 'too_large; content equality not established'
        else:
            try:
                if b'\0' in a or b'\0' in b:
                    raise UnicodeError()
                at, bt = a.decode('utf-8'), b.decode('utf-8')
                # Bound quadratic line matching as well as byte volume.
                alines, blines = at.splitlines(), bt.splitlines()
                if len(alines) + len(blines) > 4000:
                    item['detail'] = 'too_many_lines; byte difference established'
                else:
                    item['final_newline'] = {'local': at.endswith('\n'), 'upstream': bt.endswith('\n')}
                    diff = '\n'.join(difflib.unified_diff(alines, blines, fromfile='local/' + name, tofile='upstream/' + name, lineterm=''))
                    if not diff and a != b:
                        item['detail'] = 'line_separator_only_difference; byte difference established'
                    item['diff'] = diff[:remaining]
                    item['diff_truncated'] = len(diff) > remaining
                    remaining -= len(item['diff'])
            except UnicodeError:
                item['detail'] = 'binary_or_non_utf8; byte difference established'
        changes.append(item)
    return {'direction': 'local_to_upstream', 'changes': changes,
            'attribution': 'base_relative_bytes_only' if ancestor is not None else 'unavailable_without_base',
            'provenance': 'not_verified_by_comparator'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('local')
    parser.add_argument('upstream')
    parser.add_argument('--base')
    args = parser.parse_args()
    try:
        print(json.dumps(compare(args.local, args.upstream, args.base), ensure_ascii=True))
    except ComparisonError as exc:
        print(json.dumps({'error': str(exc)}), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
