import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PySide6.QtWidgets import QApplication
from gui.widgets.combat_tab_bar import CombatTabBar

_app = QApplication.instance() or QApplication([])


def test_set_targeted_indices_triggers_repaint():
    bar = CombatTabBar()
    for n in ("A", "B", "C"):
        bar.addTab(n)
    bar.set_targeting(targeted={1, 2}, actor=0)
    assert bar._targeted == {1, 2}
    assert bar._actor == 0


def test_actor_excluded_from_targeted_paint_set():
    bar = CombatTabBar()
    for n in ("A", "B"):
        bar.addTab(n)
    bar.set_targeting(targeted={0, 1}, actor=0)
    # the paint set excludes the actor's own tab
    assert bar.arrow_indices() == {1}
