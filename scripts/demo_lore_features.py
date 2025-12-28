#!/usr/bin/env python3
"""Demo script to show excerpt and clickable link features"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Mock a conflict report output
mock_conflict = {
    "entity": "Merrowgate",
    "attribute": "founding_date",
    "values": [
        {
            "value": "4150",
            "sources": ["world/factions/merrowgate/_overview.md#L23"],
            "excerpts": [
                {
                    "citation": "world/factions/merrowgate/_overview.md#L23",
                    "text": "Merrowgate was founded in 4150 AF when the first merchant princes established the neutral trade hub",
                }
            ],
        },
        {
            "value": "4152",
            "sources": ["world/factions/merrowgate/guilds.md#L15"],
            "excerpts": [
                {
                    "citation": "world/factions/merrowgate/guilds.md#L15",
                    "text": "The city's official charter was signed in 4152 AF, marking the formal recognition of Merrowgate",
                }
            ],
        },
    ],
}

print("# Example Conflict Report with Excerpts and Clickable Links\n")
print(f"### {mock_conflict['entity']} — `{mock_conflict['attribute']}`\n")

for v in mock_conflict["values"]:
    value_text = v["value"]
    source_links = [f"[{s}]({s})" for s in v["sources"]]
    citations = ", ".join(source_links)
    print(f"- **{value_text}** — {citations}")

    excerpts = v.get("excerpts", [])
    if excerpts:
        for exc in excerpts:
            print(f"  > {exc['text']}...")

    print()

print("\n✅ Links are now clickable in VS Code!")
print("✅ Excerpts show context even without LLM mode!")
