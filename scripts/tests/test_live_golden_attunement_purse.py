"""The attunement live golden must not race the coin purse's claim (W2-A1).

Since attunement 0.3.0 a bonded coin purse is claimed and paid ~750 ms after it is created on any
non-pile actor (README: it "pays its coin to whoever takes it"). The golden's chest is a non-pile
npc, so the purse it stashes there starts paying the *chest*. The golden must take the purse home
to the owner straight after the stash snapshot, before any other awaited work (the ring's way
home), so the chest's claim always finds the purse gone and stands down. With the ring step in
between, a visible tab (setTimeout not clamped) could let the chest's claim win (W5L 2026-10-12:
"deterministic in a hidden tab; a visible tab may race"). `purseHome.chestCurrency` makes a
double payment visible, and the `stash(..., {detail})` copy ids are tagged so the declared block
does not differ by a random id on every run."""
from pathlib import Path

GOLDEN = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/attunement.js"


def _src():
    return GOLDEN.read_text(encoding="utf8")


def test_purse_goes_home_before_the_ring():
    src = _src()
    stash = src.index("S.stash = {")
    purse = src.index("the purse comes home")
    ring = src.index("the ring comes home")
    assert stash < purse < ring, "the purse must be taken home straight after the stash snapshot"
    # nothing awaited between the stash snapshot and the purse step
    between = src[src.index("};", stash):purse]
    assert "await" not in between, between


def test_purse_home_records_the_chests_coin():
    assert "chestCurrency" in _src()


def test_stash_detail_copy_ids_are_tagged():
    src = _src()
    block = src[src.index("D.stashDetail"):src.index("D.toasts")]
    assert "r?.created" in block and "tag(" in block, block
