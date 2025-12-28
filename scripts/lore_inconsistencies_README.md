# Lore Inconsistencies Checker

## Overview

The `lore_inconsistencies.py` script is a tool for auditing your D&D campaign notes for potential lore inconsistencies. It:

1. **Indexes** your Markdown files and history TSV files into a vector database (ChromaDB)
2. **Discovers** entities (factions, characters, locations) from your documentation
3. **Extracts** claims about each entity using an optional LLM
4. **Detects** potential conflicts where the same entity has contradictory attributes
5. **Generates** a Markdown report of findings

## Features

- **Offline mode**: Works without an LLM using hash-based embeddings
- **LLM mode**: Uses OpenAI-compatible APIs for claim extraction and conflict adjudication
- **Incremental**: Reuses cached embeddings for faster subsequent runs
- **Flexible**: Scan specific folders or entity lists
- **Fast**: Efficient chunking and vector search

## Installation

Dependencies are already in `pyproject.toml`. Ensure ChromaDB is installed:

```bash
uv sync
```

## Usage

### Basic (Offline)

Scan your entire repo without using an LLM:

```bash
python scripts/lore_inconsistencies.py \
  --embedding-provider hash \
  --llm-provider none \
  --max-entities 50
```

### With LLM (Claim Extraction)

Set your OpenAI API key and run with LLM-based claim extraction:

```bash
export OPENAI_API_KEY="your-key-here"

python scripts/lore_inconsistencies.py \
  --embedding-provider openai \
  --llm-provider openai \
  --llm-model gpt-5.2 \
  --max-entities 50
```

### Scan Specific Folders

Focus on particular factions or areas:

```bash
python scripts/lore_inconsistencies.py \
  --roots world/factions/merrowgate,world/factions/elderholt \
  --llm-provider none \
  --max-entities 20
```

### With Conflict Adjudication

Use the LLM to evaluate whether detected conflicts are real:

```bash
python scripts/lore_inconsistencies.py \
  --llm-provider openai \
  --adjudicate \
  --max-conflicts 20
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output` | Output Markdown report path | `.output/inconsistencies.md` |
| `--persist-dir` | ChromaDB storage directory | `.output/chroma` |
| `--collection` | Collection name (auto-generated if empty) | _(auto)_ |
| `--roots` | Comma-separated paths to scan | _(entire repo)_ |
| `--reindex` | Rebuild the vector DB from scratch | `false` |
| `--max-files` | Limit files scanned (for debugging) | _(unlimited)_ |
| `--chunk-max-chars` | Max characters per chunk | `1800` |
| `--embedding-provider` | `hash` (offline) or `openai` | `hash` |
| `--hash-dim` | Hash embedding dimension | `512` |
| `--entities` | Comma-separated entity names | _(auto-discover)_ |
| `--entity-file` | Path to entity list file | _(none)_ |
| `--max-entities` | Max entities to audit | `50` |
| `--top-k` | Chunks retrieved per entity | `8` |
| `--llm-provider` | `none` or `openai` | `openai` |
| `--llm-model` | LLM model name | `gpt-4` |
| `--adjudicate` | Use LLM to judge conflicts | `false` |
| `--max-conflicts` | Max conflicts to adjudicate | `50` |
| `--print-report` | Print report to stdout | `false` |

## How It Works

### 1. Indexing

The script scans:
- **Markdown files** (`.md`): Chunked by heading hierarchy
- **History TSV files** (`_history.tsv`, `_timeline.tsv`): One chunk per event row

Each chunk is embedded using either:
- **Hash embeddings** (offline, deterministic)
- **OpenAI embeddings** (requires API key)

### 2. Entity Discovery

Entities are discovered by:
1. Reading the first `# Heading` from each Markdown file
2. Using filenames as fallback
3. Filtering out generic titles (README, Contributing, etc.)

You can override this by providing `--entities` or `--entity-file`.

### 3. Claim Extraction (LLM mode only)

For each entity:
1. Retrieve top-K most relevant chunks via vector search
2. Send chunks to the LLM with a structured prompt
3. Extract atomic, factual claims with citations

Example claim:
```json
{
  "attribute": "founding_date",
  "value": "4150",
  "sources": ["world/factions/merrowgate/_overview.md#L23"],
  "confidence": 0.9
}
```

### 4. Conflict Detection

Claims are grouped by entity and attribute. If an attribute has multiple distinct values, it's flagged as a potential conflict.

### 5. Adjudication (Optional)

If `--adjudicate` is enabled, the LLM evaluates each conflict to determine:
- Is this a real contradiction or compatible (e.g., different time periods)?
- Severity: low, medium, high
- Suggested follow-up actions

## Output

The report includes:
- **Summary**: Files scanned, entities audited, conflicts found
- **Conflicts**: Each conflict with values, sources, excerpts, and clickable links
- **Entities (Claims)**: All extracted claims organized by entity and attribute (LLM mode only)

### Features
- **Clickable links**: Citations are formatted as VS Code-compatible links you can click to jump to the file/line
- **Context excerpts**: Shows relevant text from each source so you can see why it conflicts
- **Adjudication**: Optional LLM analysis of whether conflicts are real or compatible

Example output:
```markdown
### Merrowgate — `founding_date`

- **4150** — [world/factions/merrowgate/_overview.md#L23](world/factions/merrowgate/_overview.md#L23)
  > Merrowgate was founded in 4150 AF when the first merchant princes established the neutral trade hub...

- **4152** — [world/factions/merrowgate/guilds.md#L15](world/factions/merrowgate/guilds.md#L15)
  > The city's official charter was signed in 4152 AF, marking the formal recognition of Merrowgate...

**Adjudication** (if --adjudicate enabled)
- is_conflict: `true`
- severity: `medium`
- reason: These dates conflict without additional context
- followup: Verify primary source and update documentation
```

In VS Code, you can **Cmd+Click** (Mac) or **Ctrl+Click** (Windows/Linux) on the bracketed links to open the file at the specific line.

## Performance Tips

1. **Use hash embeddings** for fast offline operation
2. **Limit --roots** to specific folders when debugging
3. **Reuse the DB**: Don't use `--reindex` unless needed
4. **Batch entities**: Process fewer entities first, then scale up

## Troubleshooting

### ChromaDB errors

If you see persistence errors, try:
```bash
rm -rf .output/chroma
python scripts/lore_inconsistencies.py --reindex
```

### OpenAI API errors

Check:
- `OPENAI_API_KEY` is set
- Model name is correct (default `gpt-4` may need adjustment)
- You have API credits

### Empty entity list

The auto-discovery may fail if:
- Markdown files lack `# Heading` lines
- All discovered names are filtered out
- Provide explicit `--entities` list

## Testing

Run the test suite:
```bash
pytest scripts/tests/test_lore_inconsistencies.py -v
```

Tests cover:
- CSV parsing
- Hash embedding consistency and normalization
- Markdown chunking with headings and code blocks
- TSV parsing
- Entity discovery
- Excerpt rendering

## Integration with MCP

This script exposes an MCP tool definition in the `MCP_TOOL` constant at the top of the file. It can be integrated into Model Context Protocol servers for use by AI assistants.

## Limitations

- **LLM quality**: Claim extraction quality depends on the LLM model
- **Context window**: Very long files may be truncated
- **Semantic search**: Hash embeddings are less accurate than neural embeddings
- **Language**: Optimized for English text

## Future Enhancements

Potential improvements:
- Support for more file types (YAML, JSON)
- Better timeline date conflict detection
- UI for interactive conflict resolution
- Multi-language support
- Automatic PR generation for fixes

## License

Same as parent project.
