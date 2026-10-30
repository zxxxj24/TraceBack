"""Inventory and explicit, reviewed deletion of paired legacy analysis snapshots.

No data is changed without --delete, a saved --plan, explicit --analysis-id,
and --acknowledge-history-loss. Stop analysis workers before deleting.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil


ID = re.compile(r'ana_[0-9a-f]{64}')
ACTIVE = {'queued', 'running', 'QUEUED', 'VALIDATING', 'RUNNING'}
SKIP = {'.git', '.venv', 'node_modules', '__pycache__', '.tmp', '.workbuddy'}


def safe_tree(path, root):
    """Reject symlinks/junctions at every level before walking or deleting."""
    root = root.resolve()
    def check(item):
        if item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()):
            raise ValueError('linked_snapshot_path:' + str(item))
        # Python 3.11 on Windows exposes junctions through reparse attributes.
        if item.exists() and getattr(item.lstat(), 'st_file_attributes', 0) & 0x400:
            raise ValueError('reparse_snapshot_path:' + str(item))
        if not item.resolve().is_relative_to(root):
            raise ValueError('snapshot_path_outside_root')
    for parent in (path, *path.parents):
        if parent == root:
            break
        check(parent)
    if not path.exists():
        return []
    rows = []
    for base, dirs, files in os.walk(path, followlinks=False):
        for name in dirs + files:
            check(Path(base) / name)
        for name in sorted(files):
            item = Path(base) / name
            stat = item.stat()
            rows.append((item.relative_to(root).as_posix(), stat.st_size, stat.st_mtime_ns))
    return sorted(rows)


def references(root):
    """Best-effort source/document/JSON reference scan; never read raw alerts."""
    found, skipped = {}, []
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in SKIP and not (Path(base)/d).is_symlink()
                   and not (getattr((Path(base)/d).lstat(), 'st_file_attributes', 0) & 0x400)]
        relative = Path(base).relative_to(root)
        if relative.parts and relative.parts[0] == 'data':
            dirs[:] = []
            continue
        for name in files:
            p = Path(base) / name
            if p.is_symlink() or p.suffix not in {'.py', '.md', '.json', '.yaml', '.yml', '.toml', '.tsx', '.ts'}:
                continue
            # Result bodies are not reference metadata; scanning them would
            # needlessly parse sensitive multi-gigabyte evidence.
            if relative.parts[:2] == ('outputs', 'analyses') and name not in {'manifest.json', 'run.json'}:
                continue
            if p.stat().st_size > 8*1024*1024:
                skipped.append(p.relative_to(root).as_posix())
                continue
            for identity in set(ID.findall(p.read_text(encoding='utf8', errors='replace'))):
                # A snapshot's own identity does not constitute an external use.
                if identity not in relative.parts:
                    found.setdefault(identity, []).append(p.relative_to(root).as_posix())
    return found, skipped


def inventory(root):
    root = Path(root).resolve()
    refs, skipped = references(root)
    bases = [root/'data/processed', root/'outputs/analyses']
    identities = set()
    for base in bases:
        if base.is_symlink() or (base.exists() and getattr(base.lstat(), 'st_file_attributes', 0) & 0x400):
            raise ValueError('linked_snapshot_base')
        if base.exists():
            identities.update(p.name for p in base.iterdir() if ID.fullmatch(p.name))
    items = []
    for identity in sorted(identities):
        paths = [base/identity for base in bases]
        files = [row for p in paths for row in safe_tree(p, root)]
        manifest_path = paths[1]/'manifest.json'
        manifest_bytes = manifest_path.read_bytes() if manifest_path.is_file() else b''
        try:
            manifest = json.loads(manifest_bytes) if manifest_bytes else {}
        except (ValueError, UnicodeError):
            manifest = {}
        status = manifest.get('status', 'unknown')
        blockers = []
        if status in ACTIVE:
            blockers.append('active_analysis')
        if status in {'sealed', 'unknown'}:
            blockers.append('sealed_or_unclassified_snapshot')
        if refs.get(identity):
            blockers.append('external_references_found')
        fingerprint = sha256(json.dumps(files, separators=(',', ':')).encode()+manifest_bytes).hexdigest()
        items.append(dict(analysis_id=identity, status=status, algorithm_version=manifest.get('algorithm_version'),
            diagnostic_storage=manifest.get('diagnostic_storage_version', 'legacy'),
            bytes=sum(f[1] for f in files), files=len(files),
            diagnostics_bytes=sum(f[1] for f in files if f[0].endswith('/diagnostics.jsonl')),
            present=[p.exists() for p in paths], fingerprint=fingerprint,
            references=refs.get(identity, []), blockers=blockers))
    total = sum(i['bytes'] for i in items)
    return dict(version=1, root=str(root), total_bytes=total,
        diagnostic_total_bytes=sum(i['diagnostics_bytes'] for i in items),
        auxiliary_project_budget_bytes=2*1024**3,
        diagnostic_jsonl_over_budget=sum(i['diagnostics_bytes'] for i in items) > 2*1024**3,
        reference_scan='best_effort_text_only; review incremental workspaces and external consumers separately',
        skipped_large_reference_files=skipped,
        items=sorted(items, key=lambda i: (-i['bytes'], i['analysis_id'])))


def delete_selected(root, plan, identities, acknowledge=False):
    root = Path(root).resolve()
    if not acknowledge or not identities:
        raise ValueError('explicit_ids_and_history_loss_acknowledgement_required')
    if plan.get('version') != 1 or plan.get('root') != str(root):
        raise ValueError('plan_root_or_version_mismatch')
    if len(set(identities)) != len(identities) or any(not ID.fullmatch(i) for i in identities):
        raise ValueError('invalid_analysis_ids')
    current = {i['analysis_id']: i for i in inventory(root)['items']}
    planned = {i['analysis_id']: i for i in plan['items']}
    # Validate every target before deleting the first directory.
    targets = []
    for identity in identities:
        if identity not in planned or identity not in current:
            raise ValueError('snapshot_not_in_plan:' + identity)
        item = current[identity]
        if item['blockers']:
            raise ValueError('snapshot_protected:' + identity)
        if item['fingerprint'] != planned[identity]['fingerprint']:
            raise ValueError('snapshot_changed_since_plan:' + identity)
        for base in ('data/processed', 'outputs/analyses'):
            path = root/base/identity
            safe_tree(path, root)
            if path.exists():
                targets.append(path)
    for path in targets:
        shutil.rmtree(path)
    return dict(deleted=identities, released_logical_bytes=sum(current[i]['bytes'] for i in identities))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, help='Write reviewable inventory JSON')
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--analysis-id', action='append', default=[])
    parser.add_argument('--delete', action='store_true')
    parser.add_argument('--acknowledge-history-loss', action='store_true')
    args = parser.parse_args()
    if args.delete:
        if not args.plan:
            parser.error('--delete requires --plan')
        result = delete_selected(args.root, json.loads(args.plan.read_text(encoding='utf8')),
                                 args.analysis_id, args.acknowledge_history_loss)
    else:
        result = inventory(args.root)
    payload = json.dumps(result, ensure_ascii=False, indent=2)+'\n'
    if args.output:
        destination = args.output.resolve()
        if any(destination.is_relative_to(args.root.resolve()/base) for base in ('data', 'outputs/analyses')):
            parser.error('inventory output must be outside snapshot/data directories')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(payload, encoding='utf8')
    print(payload)


if __name__ == '__main__':
    main()
