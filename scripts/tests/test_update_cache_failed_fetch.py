"""A failed upstream fetch is not cached (EC-11).

``fetch_json`` and ``gh_api`` return ``None`` when the upstream is unreachable. Caching
that ``None`` would pin the package to "unresolved" for the whole six-hour TTL, so
``_cached`` writes nothing for ``None`` and treats a ``null`` already on disk as a miss.
"""

from __future__ import annotations

from scripts.foundry.update import upstream


def _counter(*values):
    calls = []

    def produce():
        calls.append(1)
        return values[min(len(calls), len(values)) - 1]

    return produce, calls


def test_ec11_a_failed_fetch_is_retried_on_the_next_call(monkeypatch, tmp_path):
    monkeypatch.setattr(upstream, "CACHE_DIR", tmp_path)
    produce, calls = _counter(None, {"version": "1.2.0"})
    assert upstream._cached("manifest_x", produce) is None
    assert not upstream._cache_path("manifest_x").exists()
    assert upstream._cached("manifest_x", produce) == {"version": "1.2.0"}
    assert len(calls) == 2
    # …and a success is cached as before.
    assert upstream._cached("manifest_x", produce) == {"version": "1.2.0"}
    assert len(calls) == 2


def test_ec11_a_null_already_on_disk_is_a_miss(monkeypatch, tmp_path):
    monkeypatch.setattr(upstream, "CACHE_DIR", tmp_path)
    upstream._cache_path("gh_latest_o_m").write_text("null", encoding="utf-8")
    produce, calls = _counter({"tag_name": "v2.0.0"})
    assert upstream._cached("gh_latest_o_m", produce) == {"tag_name": "v2.0.0"}
    assert len(calls) == 1
