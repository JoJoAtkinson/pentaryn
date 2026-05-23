"""Parser tests for `info <id|name>` out-of-band verb."""
import pytest

from gui.dispatcher import parse


def test_info_no_arg_parses():
    cmd = parse("info")
    assert cmd.kind == "info"
    assert cmd.info_token == ""


def test_info_with_number_token():
    cmd = parse("info 1")
    assert cmd.kind == "info"
    assert cmd.info_token == "1"


def test_info_with_name_token():
    cmd = parse("info antireality")
    assert cmd.kind == "info"
    assert cmd.info_token == "antireality"


def test_info_with_multiword_token():
    cmd = parse("info  void  ray")
    assert cmd.kind == "info"
    # Internal whitespace is collapsed by parse() — matches the rest of the
    # grammar. Caller will resolve "void ray" against verbs/action names.
    assert cmd.info_token == "void ray"


def test_info_is_case_insensitive():
    cmd = parse("INFO Antireality")
    assert cmd.kind == "info"
    assert cmd.info_token == "Antireality"


def test_who_then_info_is_not_an_info_command():
    """A leading combatant id makes this a normal command, not an info request.
    `info` is sigil-first: it must be the first token."""
    cmd = parse("1 info")
    # The `info` is not consumed as an out-of-band sigil because `1` was
    # consumed as <who>. The remaining stream `info` is an unknown verb →
    # unparseable (LLM fallback).
    assert cmd.kind != "info"
