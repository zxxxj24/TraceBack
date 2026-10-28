"""Storage reduction must preserve decisions, published facts and deletion safety."""
import importlib.util
import json
from pathlib import Path

import duckdb
import pytest

from app.services.storage import MODELS, SnapshotStore
from test_analysis_service import service, write_input, request_for, edge_records


def test_compact_and_full_have_identical_facts_and_exact_decisions(tmp_path, monkeypatch):
    svc = service(tmp_path, edge=True)
    try:
        request = request_for(write_input(tmp_path, edge_records()))
        monkeypatch.setenv('TRACEBACK_DIAGNOSTICS_MODE', 'full')
        full = SnapshotStore(tmp_path, svc.create(request, background=False))
        assert full.read_metadata()[0].is_complete
        original = [json.loads(line) for line in (full.details/'diagnostics.jsonl').read_text(encoding='utf8').splitlines()]
        monkeypatch.setenv('TRACEBACK_DIAGNOSTICS_MODE', 'compact')
        compact = SnapshotStore(tmp_path, svc.create(request, background=False))
        assert compact.read_metadata()[0].is_complete
        assert compact.validate_reconstruction().valid
        for kind in MODELS:
            assert list(full.read_records(kind)) == list(compact.read_records(kind))
        expected = [r for r in original if r['stage'] == 'correlation_decision']
        assert expected
        with duckdb.connect(':memory:') as db:
            actual = db.execute('SELECT source_id,target_id,decision,score FROM read_parquet(?) ORDER BY source_id,target_id',
                                [str(compact.details/'candidate_decisions/*.parquet')]).fetchall()
        assert actual == sorted(((*r['support_key'], r['decision'], r['score']) for r in expected))
        summary = json.loads((compact.details/'bounded_diagnostics.json').read_text(encoding='utf8'))
        assert summary['counts']['member_score'] == sum(r['stage'] == 'member_score' for r in original)
    finally:
        svc.close()


def test_optional_detail_budget_does_not_drop_essential_evidence(tmp_path, monkeypatch):
    monkeypatch.setenv('TRACEBACK_DIAGNOSTICS_DETAIL_MIB', '1')
    store = SnapshotStore(tmp_path, 'ana_'+'a'*64)
    with store.diagnostics_writer() as sink:
        sink({'stage': 'ordinary', 'payload': 'x'*700000})
        sink({'stage': 'ordinary', 'payload': 'y'*700000})
        sink({'stage': 'incremental_edge', 'edge_id': 'required', 'payload': 'z'*700000})
    summary = json.loads((store.details/'bounded_diagnostics.json').read_text())
    assert summary['detail_bytes'] <= 1024**2
    assert summary['counts']['ordinary'] == 2
    assert summary['counts']['general_records_aggregated_after_size_guard'] == 1
    rows = [json.loads(s) for s in (store.details/'diagnostics.jsonl').read_text().splitlines()]
    assert any(r.get('edge_id') == 'required' for r in rows)


def test_full_debug_has_an_explicit_limit(tmp_path, monkeypatch):
    monkeypatch.setenv('TRACEBACK_DIAGNOSTICS_MODE', 'full')
    monkeypatch.setenv('TRACEBACK_DIAGNOSTICS_FULL_MIB', '1')
    with pytest.raises(ValueError, match='full_diagnostics_budget_exceeded'):
        with SnapshotStore(tmp_path, 'ana_'+'b'*64).diagnostics_writer() as sink:
            sink({'stage': 'member_score', 'payload': 'x'*(1024**2)})


def test_full_member_evaluation_refuses_compact_population(tmp_path):
    from types import SimpleNamespace
    from evaluation.io.diagnostics import extract_scores
    with pytest.raises(ValueError, match='full_diagnostics_required'):
        extract_scores(SimpleNamespace(manifest={'diagnostic_storage_version': 'compact-diagnostics-v1'}), tmp_path)
    from app.api.score_diagnostics import stream_diagnostics
    (tmp_path/'bounded_diagnostics.json').write_text('{}')
    with pytest.raises(ValueError, match='full_diagnostics_required'):
        stream_diagnostics(tmp_path/'diagnostics.jsonl', None)


def test_many_member_details_reduce_without_losing_candidate_decisions(tmp_path):
    store = SnapshotStore(tmp_path, 'ana_'+'c'*64)
    raw_bytes = 0
    def emit(sink, row):
        nonlocal raw_bytes
        raw_bytes += len(json.dumps(row).encode())+1
        sink(row)
    with store.diagnostics_writer() as sink:
        for i in range(10):
            pair = [str(i), str(i+1)]
            emit(sink, {'stage': 'candidate', 'support_key': pair})
            for _ in range(200):
                emit(sink, dict(stage='member_score', support_pair=pair, score=.1, valid=True,
                                evidence={'details': 'x'*1024}, rejection_codes=[]))
            emit(sink, dict(stage='correlation_decision', support_key=pair, decision='reject',
                            score=.1, threshold=.65, rule_id='below_correlation_threshold'))
    total = sum(p.stat().st_size for p in store.details.rglob('*') if p.is_file())
    assert total < raw_bytes/5
    summary = json.loads((store.details/'bounded_diagnostics.json').read_text())
    assert summary['counts']['member_score'] == 2000
    with duckdb.connect(':memory:') as db:
        assert db.execute('SELECT count(*) FROM read_parquet(?)',
                          [str(store.details/'candidate_decisions/*.parquet')]).fetchone()[0] == 10


@pytest.fixture
def maintenance():
    path = Path(__file__).resolve().parents[2]/'scripts/snapshot_storage.py'
    spec = importlib.util.spec_from_file_location('snapshot_storage', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def snapshot(root, digit='a', status='completed'):
    identity = 'ana_'+digit*64
    for base in ('data/processed', 'outputs/analyses'):
        directory = root/base/identity
        directory.mkdir(parents=True)
        (directory/'record.jsonl').write_text('{}\n')
    (root/'outputs/analyses'/identity/'manifest.json').write_text(json.dumps(dict(status=status, analysis_id=identity)))
    return identity


def test_inventory_is_read_only_and_requires_review_before_delete(tmp_path, maintenance):
    identity = snapshot(tmp_path)
    plan = maintenance.inventory(tmp_path)
    with pytest.raises(ValueError, match='acknowledgement'):
        maintenance.delete_selected(tmp_path, plan, [identity])
    assert (tmp_path/'data/processed'/identity).exists()
    result = maintenance.delete_selected(tmp_path, plan, [identity], acknowledge=True)
    assert result['released_logical_bytes'] > 0
    assert not (tmp_path/'data/processed'/identity).exists()
    assert not (tmp_path/'outputs/analyses'/identity).exists()


@pytest.mark.parametrize('condition', ['referenced', 'running', 'sealed', 'changed', 'traversal'])
def test_cleanup_refuses_unsafe_targets(tmp_path, maintenance, condition):
    identity = snapshot(tmp_path, status=condition if condition in {'running', 'sealed'} else 'completed')
    plan = maintenance.inventory(tmp_path)
    if condition == 'referenced':
        (tmp_path/'consumer.json').write_text(json.dumps({'parent_analysis_id': identity}))
    if condition == 'changed':
        (tmp_path/'data/processed'/identity/'record.jsonl').write_text('changed')
    with pytest.raises(ValueError):
        maintenance.delete_selected(tmp_path, plan, ['../'+identity] if condition == 'traversal' else [identity], acknowledge=True)
    assert (tmp_path/'data/processed'/identity).exists()


def test_cleanup_refuses_junctions(tmp_path, maintenance):
    import os
    import subprocess
    if os.name != 'nt':
        pytest.skip('Windows junction regression')
    identity = snapshot(tmp_path)
    outside = tmp_path/'preserve'
    outside.mkdir()
    (outside/'important.txt').write_text('keep')
    junction = tmp_path/'data/processed'/identity/'link'
    # Literal test-only paths; no file deletion is composed across shells.
    subprocess.run(['cmd', '/c', 'mklink', '/J', str(junction), str(outside)], check=True, capture_output=True)
    try:
        with pytest.raises(ValueError, match='reparse|linked'):
            maintenance.inventory(tmp_path)
        assert (outside/'important.txt').read_text() == 'keep'
    finally:
        os.rmdir(junction)
