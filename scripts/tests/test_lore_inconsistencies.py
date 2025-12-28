#!/usr/bin/env python3
"""Tests for lore_inconsistencies.py"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

# Import functions from the script
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lore_inconsistencies import (
    _citation_path,
    _chunk_history_tsv,
    _chunk_markdown,
    _discover_entities_from_files,
    _discover_history_event_ids,
    _excerpt_has_non_heading_content,
    _hash_embed,
    _parse_csv_list,
    _render_excerpt,
    _split_by_char_budget,
    Chunk,
)


def test_parse_csv_list_basic() -> None:
    """Test CSV list parsing with basic comma separation."""
    result = _parse_csv_list("foo,bar,baz")
    assert result == ["foo", "bar", "baz"]


def test_parse_csv_list_with_spaces() -> None:
    """Test CSV list parsing with spaces."""
    result = _parse_csv_list("foo , bar , baz ")
    assert result == ["foo", "bar", "baz"]


def test_parse_csv_list_json_array() -> None:
    """Test CSV list parsing with JSON array format."""
    result = _parse_csv_list('["foo", "bar", "baz"]')
    assert result == ["foo", "bar", "baz"]


def test_parse_csv_list_empty() -> None:
    """Test CSV list parsing with empty string."""
    assert _parse_csv_list("") == []
    assert _parse_csv_list(None) == []
    assert _parse_csv_list("  ") == []


def test_hash_embed_consistency() -> None:
    """Test that hash embedding produces consistent results."""
    text = "This is a test sentence for embedding."
    embed1 = _hash_embed(text, dim=128)
    embed2 = _hash_embed(text, dim=128)
    assert embed1 == embed2
    assert len(embed1) == 128


def test_hash_embed_normalization() -> None:
    """Test that hash embeddings are normalized (unit vectors)."""
    text = "Test normalization"
    embed = _hash_embed(text, dim=64)
    # Calculate L2 norm
    norm = sum(x * x for x in embed) ** 0.5
    assert abs(norm - 1.0) < 1e-6, f"Expected unit vector, got norm={norm}"


def test_hash_embed_different_texts() -> None:
    """Test that different texts produce different embeddings."""
    embed1 = _hash_embed("completely different text", dim=128)
    embed2 = _hash_embed("another piece of content", dim=128)
    assert embed1 != embed2


def test_chunk_markdown_basic(tmp_path: Path) -> None:
    """Test basic markdown chunking."""
    md_file = tmp_path / "test.md"
    md_file.write_text(
        """# Title

This is some content under the title.

## Subsection

More content here.
"""
    )
    chunks = _chunk_markdown(md_file, max_chars=500)
    assert len(chunks) > 0
    assert all(isinstance(c, Chunk) for c in chunks)
    assert all(c.metadata["kind"] == "md" for c in chunks)


def test_chunk_markdown_respects_max_chars(tmp_path: Path) -> None:
    """Test that markdown chunking respects character limits."""
    md_file = tmp_path / "test.md"
    long_content = "This is a line.\n" * 200
    md_file.write_text(f"# Title\n\n{long_content}")
    chunks = _chunk_markdown(md_file, max_chars=500)
    # Should split into multiple chunks
    assert len(chunks) > 1
    # Each chunk should be reasonably sized (accounting for headers)
    for chunk in chunks:
        assert len(chunk.text) < 1000  # Generous upper bound


def test_chunk_history_tsv_basic(tmp_path: Path) -> None:
    """Test basic history TSV chunking."""
    tsv_file = tmp_path / "_history.tsv"
    tsv_file.write_text(
        "event_id\ttags\tdate\tduration\ttitle\tsummary\n"
        "evt-001\tpublic;faction1\t4200\t0\tBattle of X\tA great battle\n"
        "evt-002\tfaction2\t4201/05\t7\tSiege of Y\tA long siege\n"
    )
    chunks = _chunk_history_tsv(tsv_file)
    assert len(chunks) == 2
    assert all(c.metadata["kind"] == "history_tsv" for c in chunks)
    assert chunks[0].metadata["event_id"] == "evt-001"
    assert chunks[1].metadata["event_id"] == "evt-002"


def test_chunk_history_tsv_empty(tmp_path: Path) -> None:
    """Test history TSV chunking with empty file."""
    tsv_file = tmp_path / "_history.tsv"
    tsv_file.write_text("")
    chunks = _chunk_history_tsv(tsv_file)
    assert len(chunks) == 0


def test_discover_entities_from_files(tmp_path: Path) -> None:
    """Test entity discovery from markdown files."""
    file1 = tmp_path / "entity1.md"
    file1.write_text("# Entity One\n\nContent about entity one.")

    file2 = tmp_path / "entity2.md"
    file2.write_text("# Entity Two\n\nContent about entity two.")

    file3 = tmp_path / "README.md"
    file3.write_text("# README\n\nThis should be filtered out.")

    files = [file1, file2, file3]
    entities = _discover_entities_from_files(files, max_entities=10)

    assert "Entity One" in entities
    assert "Entity Two" in entities
    assert "README" not in entities
    assert "readme" not in [e.casefold() for e in entities]


def test_citation_path_parsing() -> None:
    assert _citation_path("world/x.md#L12") == "world/x.md"
    assert _citation_path("world/x.md#foo") == "world/x.md"
    assert _citation_path("world/x.md") == "world/x.md"
    assert _citation_path("") == ""


def test_discover_history_event_ids(tmp_path: Path) -> None:
    tsv = tmp_path / "_history.tsv"
    tsv.write_text(
        "event_id\ttags\tdate\tduration\ttitle\tsummary\n"
        "evt-001\tpublic\t4200\t0\tA\tB\n"
        "evt-002\tpublic\t4201\t0\tC\tD\n",
        encoding="utf-8",
    )
    ids = _discover_history_event_ids([tsv], max_entities=10)
    assert ids == ["evt-001", "evt-002"]


def test_discover_entities_respects_max(tmp_path: Path) -> None:
    """Test that entity discovery respects max_entities limit."""
    files = []
    for i in range(10):
        f = tmp_path / f"entity{i}.md"
        f.write_text(f"# Entity {i}\n\nContent.")
        files.append(f)

    entities = _discover_entities_from_files(files, max_entities=5)
    assert len(entities) == 5


def test_excerpt_has_non_heading_content() -> None:
    """Test detection of non-heading content in excerpts."""
    # Only headings
    excerpt1 = "1: # Title\n2: ## Subtitle\n3: ### Sub-subtitle"
    assert not _excerpt_has_non_heading_content(excerpt1)

    # Has content
    excerpt2 = "1: # Title\n2: This is real content.\n3: More content."
    assert _excerpt_has_non_heading_content(excerpt2)

    # Empty lines and headings
    excerpt3 = "1: # Title\n2: \n3: ## Subtitle"
    assert not _excerpt_has_non_heading_content(excerpt3)


def test_render_excerpt_strips_synthetic_headers() -> None:
    """Test that excerpt rendering strips synthetic [FILE]/[HEADING] markers."""
    text = "[FILE] world/test.md\n[HEADING] Section\n\nActual content here."
    excerpt = _render_excerpt(text, default_start_line=10)

    # Should not include [FILE] or [HEADING] lines
    assert "[FILE]" not in excerpt
    assert "[HEADING]" not in excerpt
    assert "Actual content here." in excerpt


def test_render_excerpt_respects_max_lines() -> None:
    """Test that excerpt rendering respects max_lines limit."""
    lines = "\n".join([f"Line {i}" for i in range(100)])
    excerpt = _render_excerpt(lines, default_start_line=1, max_lines=20)

    result_lines = excerpt.splitlines()
    assert len(result_lines) <= 20


def test_split_by_char_budget_basic() -> None:
    """Test character budget splitting."""
    lines = [(i, f"Line {i}") for i in range(1, 11)]
    parts = _split_by_char_budget(lines, max_chars=50)

    # Should split into multiple parts
    assert len(parts) > 1

    # Each part should not exceed budget significantly
    for part in parts:
        chars = sum(len(s) + 1 for _, s in part)
        # Allow some overflow for edge cases
        assert chars <= 80


def test_split_by_char_budget_empty() -> None:
    """Test character budget splitting with empty input."""
    parts = _split_by_char_budget([], max_chars=100)
    assert parts == []


def test_chunk_markdown_with_code_blocks(tmp_path: Path) -> None:
    """Test that markdown chunking handles code blocks correctly."""
    md_file = tmp_path / "test.md"
    md_file.write_text(
        """# Code Example

Here's some code:

```python
def example():
    return "test"
```

More content after.
"""
    )
    chunks = _chunk_markdown(md_file, max_chars=500)
    assert len(chunks) > 0
    # Verify code block is preserved
    assert any("```" in chunk.text for chunk in chunks)


def test_chunk_markdown_heading_hierarchy(tmp_path: Path) -> None:
    """Test that markdown chunking tracks heading hierarchy."""
    md_file = tmp_path / "test.md"
    md_file.write_text(
        """# Level 1

Content under level 1.

## Level 2

Content under level 2.

### Level 3

Content under level 3.
"""
    )
    chunks = _chunk_markdown(md_file, max_chars=500)
    
    # Check that headings are tracked in metadata
    headings = [c.metadata.get("heading", "") for c in chunks if c.metadata.get("heading")]
    assert any("Level 1" in h for h in headings)
    assert any("Level 2" in h for h in headings)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
