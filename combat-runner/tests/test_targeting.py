from gui.targeting import split_runs, classify_who

def test_split_runs_single():
    assert split_runs("2") == ["2"]
    assert split_runs("22") == ["22"]
    assert split_runs("222") == ["222"]

def test_split_runs_multi():
    assert split_runs("123") == ["1", "2", "3"]
    assert split_runs("2233") == ["22", "33"]
    assert split_runs("122333") == ["1", "22", "333"]
    assert split_runs("0123") == ["0", "1", "2", "3"]

def test_classify_who_explicit_single():
    w = classify_who("2")
    assert w.mode == "explicit" and w.ids == ["2"]

def test_classify_who_explicit_multi():
    w = classify_who("123")
    assert w.mode == "explicit" and w.ids == ["1", "2", "3"]

def test_classify_who_self():
    w = classify_who("0")
    assert w.mode == "explicit" and w.ids == ["0"]   # "0" stays literal; resolved later

def test_classify_who_current_when_empty():
    # leading whitespace -> empty first token -> current target
    w = classify_who("")
    assert w.mode == "current" and w.ids == []

def test_classify_who_non_digit_is_current():
    # a who token that isn't all digits (e.g. starts with a sigil/word) -> current
    w = classify_who("@prone")
    assert w.mode == "current"
