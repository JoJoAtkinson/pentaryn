#!/usr/bin/env python3
"""
Open5e API integration for D&D 5e SRD content.
Provides MCP tools for accessing monsters, spells, magic items, conditions, and more.

Import as: from scripts.srd5_2 import search_monsters, search_spells, etc.
"""

from __future__ import annotations

import requests
from typing import Optional, Any
import json

BASE_URL = "https://api.open5e.com"

# MCP Tool Definitions
MCP_TOOLS = [
    {
        "name": "search_monsters",
        "description": (
            "Search D&D 5e monsters by name or filter by CR, type, size. "
            "Returns detailed stat blocks including AC, HP, abilities, attacks, and special abilities. "
            "Use for combat prep, encounter building, or quick reference during sessions."
        ),
        "argv": ["--mcp-tool", "search_monsters"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Monster name to search for (partial match, case-insensitive)"
                },
                "cr": {
                    "type": "string",
                    "description": "Challenge Rating (e.g., '1', '1/2', '5', '20')"
                },
                "type": {
                    "type": "string",
                    "description": "Creature type (e.g., 'beast', 'dragon', 'undead', 'aberration')"
                },
                "size": {
                    "type": "string",
                    "description": "Size category (Tiny, Small, Medium, Large, Huge, Gargantuan)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10)",
                    "default": 10
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "get_monster_details",
        "description": (
            "Get full stat block for a specific monster by its slug. "
            "Returns complete details: abilities, saves, skills, resistances, attacks, special abilities. "
            "Use when you need the complete stat block for running an encounter."
        ),
        "argv": ["--mcp-tool", "get_monster_details"],
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": "Monster slug (e.g., 'goblin', 'adult-red-dragon', 'beholder')"
                }
            },
            "required": ["slug"],
            "additionalProperties": False
        }
    },
    {
        "name": "search_spells",
        "description": (
            "Search D&D 5e spells by name, level, school, or class. "
            "Returns spell details: level, casting time, range, components, duration, description. "
            "Use for player/NPC spell lookups, spell prep, or answering rule questions."
        ),
        "argv": ["--mcp-tool", "search_spells"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Spell name to search for (partial match, case-insensitive)"
                },
                "level": {
                    "type": "integer",
                    "description": "Spell level (0-9, where 0 is cantrip)"
                },
                "school": {
                    "type": "string",
                    "description": "School of magic (abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10)",
                    "default": 10
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "get_spell_details",
        "description": (
            "Get full details for a specific spell by its key. "
            "Returns complete spell info including higher level effects and material components. "
            "Use when players cast spells or you need exact wording for rules."
        ),
        "argv": ["--mcp-tool", "get_spell_details"],
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Spell key (e.g., 'o5e_fireball', 'o5e_shield')"
                }
            },
            "required": ["key"],
            "additionalProperties": False
        }
    },
    {
        "name": "list_conditions",
        "description": (
            "List all D&D 5e conditions (blinded, charmed, frightened, etc.). "
            "Returns condition names and descriptions. "
            "Use during combat when you need to look up condition effects quickly."
        ),
        "argv": ["--mcp-tool", "list_conditions"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Filter by condition name (optional, partial match)"
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "search_magic_items",
        "description": (
            "Search D&D 5e magic items by name or rarity. "
            "Returns item descriptions, rarity, attunement requirements. "
            "Use for treasure generation, loot tables, or item identification."
        ),
        "argv": ["--mcp-tool", "search_magic_items"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Item name to search for (partial match, case-insensitive)"
                },
                "rarity": {
                    "type": "string",
                    "description": "Rarity (common, uncommon, rare, very rare, legendary, artifact)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10)",
                    "default": 10
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "get_class_info",
        "description": (
            "Get detailed information about a D&D 5e class. "
            "Returns class features, hit dice, proficiencies, spell progression. "
            "Use for character creation help or answering player questions about class abilities."
        ),
        "argv": ["--mcp-tool", "get_class_info"],
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": "Class slug (e.g., 'fighter', 'wizard', 'rogue', 'cleric')"
                }
            },
            "required": ["slug"],
            "additionalProperties": False
        }
    },
    {
        "name": "search_weapons",
        "description": (
            "Search D&D 5e weapons by name or properties. "
            "Returns weapon damage, properties, cost, weight. "
            "Use for equipment shopping or NPC armament."
        ),
        "argv": ["--mcp-tool", "search_weapons"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Weapon name to search for (partial match)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10)",
                    "default": 10
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "search_armor",
        "description": (
            "Search D&D 5e armor by name or type. "
            "Returns AC, cost, weight, strength requirements, stealth disadvantage. "
            "Use for equipment shopping or determining NPC armor class."
        ),
        "argv": ["--mcp-tool", "search_armor"],
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Armor name to search for (partial match)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10)",
                    "default": 10
                }
            },
            "additionalProperties": False
        }
    },
    {
        "name": "search_rules",
        "description": (
            "Search D&D 5e rules sections by keyword (e.g., 'grapple', 'cover', 'surprise', 'concentration'). "
            "Returns rule text from the 2014 SRD (note: 2024 rules not yet available in Open5e API). "
            "Use for quick reference on combat rules, conditions, ability checks, and general mechanics."
        ),
        "argv": [],
        "value_flags": {
            "query": "--query",
            "limit": "--limit"
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search term for rules (e.g., 'grapple', 'opportunity attack', 'cover', 'hiding')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 5)",
                    "default": 5
                }
            },
            "required": ["query"],
            "additionalProperties": False
        }
    },
    {
        "name": "get_rule_section",
        "description": (
            "Get full text of a specific rules section by its slug (e.g., 'attacking', 'conditions', 'cover'). "
            "Returns rule text from the 2014 SRD (note: 2024 rules not yet available in Open5e API). "
            "Use after searching to get complete rule descriptions."
        ),
        "argv": ["--mcp-tool", "get_rule_section"],
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": "Section slug (e.g., 'attacking', 'conditions', 'cover', 'spellcasting')"
                }
            },
            "required": ["slug"],
            "additionalProperties": False
        }
    }
]


def api_get(endpoint: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Make GET request to Open5e API."""
    url = f"{BASE_URL}{endpoint}"
    response = requests.get(url, params=params or {})
    response.raise_for_status()
    return response.json()


def search_monsters(
    name: Optional[str] = None,
    cr: Optional[str] = None,
    type: Optional[str] = None,
    size: Optional[str] = None,
    limit: int = 10
) -> dict[str, Any]:
    """Search monsters with optional filters."""
    params = {"limit": limit}
    if name:
        params["search"] = name
    if cr:
        params["challenge_rating"] = cr
    if type:
        params["type"] = type
    if size:
        params["size"] = size
    
    return api_get("/v1/monsters/", params)


def get_monster_details(slug: str) -> dict[str, Any]:
    """Get full monster stat block by slug."""
    return api_get(f"/v1/monsters/{slug}/")


def search_spells(
    name: Optional[str] = None,
    level: Optional[int] = None,
    school: Optional[str] = None,
    limit: int = 10
) -> dict[str, Any]:
    """Search spells with optional filters."""
    params = {"limit": limit}
    if name:
        params["search"] = name
    if level is not None:
        params["level"] = level
    if school:
        params["school"] = school
    
    return api_get("/v2/spells/", params)


def get_spell_details(key: str) -> dict[str, Any]:
    """Get full spell details by key."""
    return api_get(f"/v2/spells/{key}/")


def list_conditions(name: Optional[str] = None) -> dict[str, Any]:
    """List all conditions, optionally filtered by name."""
    params = {}
    if name:
        params["search"] = name
    
    return api_get("/v2/conditions/", params)


def search_magic_items(
    name: Optional[str] = None,
    rarity: Optional[str] = None,
    limit: int = 10
) -> dict[str, Any]:
    """Search magic items with optional filters."""
    params = {"limit": limit}
    if name:
        params["search"] = name
    if rarity:
        params["rarity"] = rarity
    
    return api_get("/v1/magicitems/", params)


def get_class_info(slug: str) -> dict[str, Any]:
    """Get detailed class information."""
    return api_get(f"/v1/classes/{slug}/")


def search_weapons(name: Optional[str] = None, limit: int = 10) -> dict[str, Any]:
    """Search weapons by name."""
    params = {"limit": limit}
    if name:
        params["search"] = name
    
    return api_get("/v2/weapons/", params)


def search_armor(name: Optional[str] = None, limit: int = 10) -> dict[str, Any]:
    """Search armor by name."""
    params = {"limit": limit}
    if name:
        params["search"] = name
    
    return api_get("/v2/armor/", params)


def search_rules(query: str, limit: int = 5) -> dict[str, Any]:
    """Search rules sections by keyword."""
    params = {"search": query, "limit": limit}
    result = api_get("/v1/sections/", params)
    return result


def get_rule_section(slug: str) -> dict[str, Any]:
    """Get full rules section by slug."""
    return api_get(f"/v1/sections/{slug}/")


def format_monster(monster: dict[str, Any], full: bool = False) -> str:
    """Format monster data for display."""
    output = []
    output.append(f"**{monster['name']}**")
    output.append(f"{monster['size']} {monster['type']}, {monster['alignment']}")
    output.append(f"**CR:** {monster['challenge_rating']}")
    output.append("")
    output.append(f"**AC:** {monster['armor_class']} ({monster.get('armor_desc', 'natural armor')})")
    output.append(f"**HP:** {monster['hit_points']} ({monster['hit_dice']})")
    output.append(f"**Speed:** {', '.join(f'{k} {v} ft.' for k, v in monster['speed'].items())}")
    output.append("")
    output.append(f"**STR** {monster['strength']} | **DEX** {monster['dexterity']} | **CON** {monster['constitution']} | **INT** {monster['intelligence']} | **WIS** {monster['wisdom']} | **CHA** {monster['charisma']}")
    
    if full:
        output.append("")
        if monster.get('senses'):
            output.append(f"**Senses:** {monster['senses']}")
        if monster.get('languages'):
            output.append(f"**Languages:** {monster['languages']}")
        
        if monster.get('special_abilities'):
            output.append("\n**Special Abilities:**")
            for ability in monster['special_abilities']:
                output.append(f"*{ability['name']}.* {ability['desc']}")
        
        if monster.get('actions'):
            output.append("\n**Actions:**")
            for action in monster['actions']:
                output.append(f"*{action['name']}.* {action['desc']}")
    
    return "\n".join(output)


def format_spell(spell: dict[str, Any]) -> str:
    """Format spell data for display."""
    output = []
    output.append(f"**{spell['name']}**")
    
    level = spell['level']
    school = spell.get('school', {}).get('name', 'Unknown')
    if level == 0:
        output.append(f"{school} cantrip")
    else:
        output.append(f"Level {level} {school}")
    
    output.append(f"**Casting Time:** {spell.get('casting_time', 'Unknown')}")
    output.append(f"**Range:** {spell.get('range_text', 'Unknown')}")
    
    components = []
    if spell.get('verbal'):
        components.append("V")
    if spell.get('somatic'):
        components.append("S")
    if spell.get('material'):
        mat = "M"
        if spell.get('material_specified'):
            mat += f" ({spell['material_specified']})"
        components.append(mat)
    output.append(f"**Components:** {', '.join(components)}")
    
    output.append(f"**Duration:** {spell.get('duration', 'Unknown')}")
    if spell.get('concentration'):
        output[-1] += " (Concentration)"
    
    output.append("")
    output.append(spell.get('desc', ''))
    
    if spell.get('higher_level'):
        output.append(f"\n**At Higher Levels:** {spell['higher_level']}")
    
    return "\n".join(output)


def format_rule_section(section: dict[str, Any]) -> str:
    """Format rules section data for display."""
    output = []
    output.append(f"**{section['name']}**")
    
    if section.get('parent'):
        output.append(f"*Section: {section['parent']}*")
    
    output.append("")
    output.append(section.get('desc', ''))
    
    return "\n".join(output)


def main():
    """Handle both MCP tool calls via flags and CLI usage."""
    import sys
    
    # Handle CLI with flags (from MCP server value_flags)
    args_dict = {}
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg.startswith('--') and i + 1 < len(sys.argv):
            flag_name = arg[2:]  # Remove '--'
            flag_value = sys.argv[i + 1]
            
            # Convert to appropriate type
            if flag_value.isdigit():
                args_dict[flag_name] = int(flag_value)
            elif flag_value.lower() in ('true', 'false'):
                args_dict[flag_name] = flag_value.lower() == 'true'
            else:
                args_dict[flag_name] = flag_value
            i += 2
        else:
            i += 1
    
    # If we got flags, execute the corresponding function
    if args_dict:
        # Infer which function based on the flags present
        if 'query' in args_dict:
            # search_rules or search_monsters or search_spells, etc.
            if 'cr' in args_dict or 'type' in args_dict or 'size' in args_dict:
                func = search_monsters
            elif 'level' in args_dict or 'school' in args_dict:
                func = search_spells
            elif 'rarity' in args_dict:
                func = search_magic_items
            else:
                # Default to search_rules for generic query
                func = search_rules
        elif 'slug' in args_dict:
            func = get_rule_section
        elif 'key' in args_dict:
            func = get_spell_details
        elif 'name' in args_dict:
            # Could be any search function, default to monsters
            if 'rarity' in args_dict:
                func = search_magic_items
            else:
                func = search_monsters
        else:
            print("Error: Unable to determine function from arguments", file=sys.stderr)
            sys.exit(1)
        
        try:
            result = func(**args_dict)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            sys.exit(0)
        except TypeError as e:
            print(f"Error: Invalid arguments: {e}", file=sys.stderr)
            sys.exit(1)
        except requests.HTTPError as e:
            print(f"API Error: {e.response.status_code} - {e.response.text}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    
    # Handle MCP tool invocation format: --mcp-tool <name> <json>
    if len(sys.argv) >= 3 and sys.argv[1] == "--mcp-tool":
        tool_name = sys.argv[2]
        
        # Check if JSON is on command line (for manual testing)
        if len(sys.argv) > 3 and not sys.argv[3].startswith("--"):
            args_json = sys.argv[3]
        else:
            # No JSON provided
            args_json = "{}"
        
        try:
            args = json.loads(args_json)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON arguments: {e}", file=sys.stderr)
            sys.exit(1)
        
        try:
            # Map tool names to functions
            tool_functions = {
                "search_monsters": search_monsters,
                "get_monster_details": get_monster_details,
                "search_spells": search_spells,
                "get_spell_details": get_spell_details,
                "list_conditions": list_conditions,
                "search_magic_items": search_magic_items,
                "get_class_info": get_class_info,
                "search_weapons": search_weapons,
                "search_armor": search_armor,
                "search_rules": search_rules,
                "get_rule_section": get_rule_section,
            }
            
            if tool_name not in tool_functions:
                print(f"Error: Unknown tool: {tool_name}", file=sys.stderr)
                sys.exit(1)
            
            # Call the function and output JSON result
            result = tool_functions[tool_name](**args)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            sys.exit(0)
            
        except requests.HTTPError as e:
            print(f"API Error: {e.response.status_code} - {e.response.text}", file=sys.stderr)
            sys.exit(1)
        except TypeError as e:
            print(f"Error: Invalid arguments for {tool_name}: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    
    # CLI usage
    if len(sys.argv) < 2:
        print("Usage: srd5_2.py <command> [args]")
        print("\nCommands:")
        print("  monster <name>    - Search for a monster")
        print("  spell <name>      - Search for a spell")
        print("  condition         - List all conditions")
        print("  item <name>       - Search for a magic item")
        print("  rule <keyword>    - Search for rules (e.g., 'grapple', 'cover')")
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == "monster" and len(sys.argv) > 2:
            name = " ".join(sys.argv[2:])
            result = search_monsters(name=name, limit=5)
            print(f"Found {result['count']} monsters:\n")
            for monster in result['results']:
                print(format_monster(monster))
                print("\n" + "="*60 + "\n")
        
        elif command == "spell" and len(sys.argv) > 2:
            name = " ".join(sys.argv[2:])
            result = search_spells(name=name, limit=5)
            print(f"Found {result['count']} spells:\n")
            for spell in result['results']:
                print(format_spell(spell))
                print("\n" + "="*60 + "\n")
        
        elif command == "condition":
            result = list_conditions()
            print(f"Found {result['count']} conditions:\n")
            for condition in result['results']:
                print(f"**{condition['name']}**")
                for desc in condition.get('descriptions', []):
                    print(desc['desc'])
                print()
        
        elif command == "item" and len(sys.argv) > 2:
            name = " ".join(sys.argv[2:])
            result = search_magic_items(name=name, limit=5)
            print(f"Found {result['count']} magic items:\n")
            for item in result['results']:
                print(f"**{item['name']}** ({item['rarity']})")
                print(f"*{item['type']}*")
                print(f"\n{item['desc']}\n")
                print("="*60 + "\n")
        
        elif command == "rule" and len(sys.argv) > 2:
            query = " ".join(sys.argv[2:])
            result = search_rules(query=query, limit=5)
            print(f"Found {result['count']} rule sections:\n")
            for section in result['results']:
                print(format_rule_section(section))
                print("\n" + "="*60 + "\n")
        
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    
    except requests.HTTPError as e:
        print(f"API Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
