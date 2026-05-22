#!/usr/bin/env python3
"""Research Curve — homebrew skill-challenge calibrator and scorer.

Two modes (selected by ACTUAL_ROLLS at the bottom of the config block):
  * Tune mode (ACTUAL_ROLLS empty): Monte Carlo simulation over
    "bail at tick N" strategies. Prints a calibration table showing
    survival, expected outcome bundle, and the equivalent flat 1d20+INV
    DC for each bail point.
  * Score mode (ACTUAL_ROLLS populated): replays an actual session,
    reports the outcome bundle and how lucky/unlucky the player was
    relative to expectation for the path they actually rolled.

The mechanic (rule "B+"):
  * Each tick the player rolls (current die) + INV_MOD. Start on d20.
  * Raw <= STRIKE_THRESHOLD -> strike: roll Deception vs DECEPTION_DC.
      - Save passes -> nothing happens.
      - Save fails  -> demote one tier on DIE_LADDER. If already at the
                       last tier (d4), enter TIGHTROPE mode instead.
  * In TIGHTROPE mode the player no longer rolls the die. Each tick they
    roll Deception only:
      - Save passes -> +1 Insight Point. Roll again next tick.
      - Save fails  -> CAUGHT. Run ends with nothing.
  * d20 ticks: lower DC by 1. Non-strike rolls also count as a "success"
    (narrative quality of intel = the raw value).
  * Post-d20 ticks (d12/d10/d8/d6/d4): lower DC by DC_REDUCTION[die] AND
    earn +1 Insight Point per tick. DC stops dropping at DC_FLOOR; insight
    keeps accumulating after that.
  * Player can bail any time and keep what they have.

Tweak the config block, re-run.
"""

import math
import random
import statistics
from dataclasses import dataclass, field

# ============================================================================
# CONFIG — edit these, then re-run
# ============================================================================

# --- Challenge calibration ---
BASE_DC          = 25
DC_FLOOR         = 12          # DC stops dropping here; further ticks -> Insight Points
STRIKE_THRESHOLD = 5           # Raw die <= this triggers demotion check
DECEPTION_DC     = 15          # DC to prevent demotion / to stay in tightrope
NAT_FAIL_VALUE   = 1           # Used by Heroic Inspiration as the reroll trigger
DIE_LADDER       = (20, 12, 10, 8, 6, 4)
TIGHTROPE_TIER   = 0           # Sentinel for tightrope mode in TickResult.die

# Per-tick DC reduction by current die (Option B: risk-weighted).
# Tuning note: setting d20=0 makes the d20 phase pure "casing" (gather
# successes only, no DC progress). That tightens the pacing if play-tests
# show the d20 phase is too cushy. Player rule is unchanged either way.
DC_REDUCTION     = {20: 1, 12: 2, 10: 3, 8: 4, 6: 5, 4: 6}

# Bundle scoring weights — used to translate the (successes, DC drop,
# insight) tuple into a single number for calibration. Tweak to reflect
# what *you* value: if successes matter more narratively than DC drop,
# raise the success weight.
BUNDLE_WEIGHTS   = {"success": 5, "dc_drop": 1, "insight": 3}

# --- Player stats ---
INV_MOD          = 6
DEC_MOD          = -1
DEC_ADVANTAGE    = True
HEROIC_INSP      = True        # One reroll allowed across the run on a nat-1

# --- Tune-mode controls ---
SIM_TRIALS       = 10_000
MAX_TICKS        = 15
RANDOM_SEED      = None        # int for reproducible runs, None for fresh

# --- Mode override ---
# If True, the script prints only the player-facing rules and exits.
# Useful when you just want to copy-paste the rules to hand to players.
RULES_ONLY       = False

# --- Score-mode input ---
# Each entry is a dict. Two shapes:
#   Normal die tick:
#     die          : 20|12|10|8|6|4
#     raw          : raw face value
#     heroic_reroll: optional int — raw value after HI reroll (only if HI used here)
#     deception    : optional list[int] — raw deception dice; len 2 if DEC_ADVANTAGE,
#                    len 1 otherwise. Provide on strikes; omit = "no save attempted"
#   Tightrope tick:
#     die          : "tightrope"
#     deception    : list[int] (required)
ACTUAL_ROLLS: list[dict] = [
    # Marwen's run under B+ rules (uncomment to score):
    # {"die": 20, "raw": 13},
    # {"die": 20, "raw": 7},
    # {"die": 20, "raw": 6},
    # {"die": 20, "raw": 1, "heroic_reroll": 1, "deception": [2, 2]},
    # {"die": 12, "raw": 9},
    # {"die": 12, "raw": 4, "deception": [10, 13]},
    # {"die": 10, "raw": 6},
]

# ============================================================================
# Core
# ============================================================================

@dataclass
class TickResult:
    tick: int
    die: int
    raw: int
    total: int
    is_strike: bool
    is_nat_fail: bool
    heroic_used: bool = False
    deception_attempted: bool = False
    deception_passed: bool = False
    demoted: bool = False


@dataclass
class RunResult:
    ticks: list[TickResult]
    bailed_at: int
    discovered: bool
    successes: int
    dc_reduction: int
    final_dc: int
    insight_pts: int
    total_value: int
    final_die: int


def _roll_deception(rng: random.Random) -> int:
    if DEC_ADVANTAGE:
        return max(rng.randint(1, 20), rng.randint(1, 20)) + DEC_MOD
    return rng.randint(1, 20) + DEC_MOD


def _p_dec_save() -> float:
    """Closed-form P(beat DECEPTION_DC) given DEC_MOD and DEC_ADVANTAGE."""
    needed = DECEPTION_DC - DEC_MOD
    if needed <= 1:
        return 1.0
    if needed > 20:
        return 0.0
    p_one = (21 - needed) / 20
    if DEC_ADVANTAGE:
        return 1 - (1 - p_one) ** 2
    return p_one


def _p_demote_per_tick(die: int) -> float:
    p_strike = min(STRIKE_THRESHOLD, die) / die
    return p_strike * (1 - _p_dec_save())


def bundle_score(r: "RunResult") -> float:
    if r.discovered:
        return 0.0
    return (
        BUNDLE_WEIGHTS["success"] * r.successes
        + BUNDLE_WEIGHTS["dc_drop"] * r.dc_reduction
        + BUNDLE_WEIGHTS["insight"] * r.insight_pts
    )


def simulate_run(rng: random.Random, bail_at: int | None = None) -> RunResult:
    die_idx = 0
    in_tightrope = False
    successes = 0
    dc_reduction = 0
    insight_pts = 0
    heroic_available = HEROIC_INSP
    discovered = False
    ticks: list[TickResult] = []
    total_value = 0

    cap = bail_at if bail_at is not None else MAX_TICKS
    for tick in range(1, cap + 1):
        if in_tightrope:
            passed = _roll_deception(rng) >= DECEPTION_DC
            tr = TickResult(
                tick=tick, die=TIGHTROPE_TIER, raw=0, total=0,
                is_strike=True, is_nat_fail=False,
                deception_attempted=True, deception_passed=passed,
            )
            if not passed:
                discovered = True
                ticks.append(tr)
                break
            insight_pts += 1
            ticks.append(tr)
            continue

        die = DIE_LADDER[die_idx]
        raw = rng.randint(1, die)
        heroic_used = False

        if raw == NAT_FAIL_VALUE and heroic_available:
            heroic_available = False
            heroic_used = True
            raw = rng.randint(1, die)

        total = raw + INV_MOD
        total_value += total
        is_nat_fail = raw == NAT_FAIL_VALUE
        is_strike = raw <= STRIKE_THRESHOLD

        tr = TickResult(
            tick=tick, die=die, raw=raw, total=total,
            is_strike=is_strike, is_nat_fail=is_nat_fail,
            heroic_used=heroic_used,
        )

        if is_strike:
            tr.deception_attempted = True
            passed = _roll_deception(rng) >= DECEPTION_DC
            tr.deception_passed = passed
            if not passed:
                tr.demoted = True
                if die_idx < len(DIE_LADDER) - 1:
                    die_idx += 1
                else:
                    in_tightrope = True

        if dc_reduction < BASE_DC - DC_FLOOR:
            dc_reduction = min(dc_reduction + DC_REDUCTION[die], BASE_DC - DC_FLOOR)

        if die != 20:
            insight_pts += 1

        if die == 20 and not is_strike:
            successes += 1

        ticks.append(tr)

    final_die = TIGHTROPE_TIER if in_tightrope else DIE_LADDER[die_idx]
    return RunResult(
        ticks=ticks,
        bailed_at=ticks[-1].tick if ticks else 0,
        discovered=discovered,
        successes=successes,
        dc_reduction=dc_reduction,
        final_dc=BASE_DC - dc_reduction,
        insight_pts=insight_pts,
        total_value=total_value,
        final_die=final_die,
    )


# ============================================================================
# Tune mode
# ============================================================================

def tune() -> None:
    print_player_rules()
    rng = random.Random(RANDOM_SEED)
    print(f"=== CALIBRATION ({SIM_TRIALS:,} sims per bail point) ===")
    print(
        f"Config: BASE_DC={BASE_DC}, DC_FLOOR={DC_FLOOR}, "
        f"INV={INV_MOD:+d}, DEC={DEC_MOD:+d}{' (adv)' if DEC_ADVANTAGE else ''}, "
        f"DEC_DC={DECEPTION_DC}, P(dec save)={_p_dec_save()*100:.0f}%"
    )
    print()
    header = (
        f"{'Tick':>4} | {'P(alive)':>8} | {'P(disc)':>7} | "
        f"{'succ':>5} | {'DCdrop':>6} | {'ins':>4} | "
        f"{'Eq.DC*':>6} | {'bundle**':>8} | {'E[score]***':>11}"
    )
    print(header)
    print("-" * len(header))

    e_scores: dict[int, float] = {}
    for bail_at in range(1, MAX_TICKS + 1):
        results = [simulate_run(rng, bail_at=bail_at) for _ in range(SIM_TRIALS)]
        alive = [r for r in results if not r.discovered]
        p_alive = len(alive) / SIM_TRIALS
        if not alive:
            print(f"{bail_at:>4} |  (all discovered)")
            continue

        p_disc_here = sum(
            1 for r in results if r.discovered and r.bailed_at == bail_at
        ) / SIM_TRIALS

        avg_succ = statistics.mean(r.successes for r in alive)
        avg_dc = statistics.mean(r.dc_reduction for r in alive)
        avg_ins = statistics.mean(r.insight_pts for r in alive)

        eq_dc = round(21 + INV_MOD - 20 * p_alive)
        eq_dc = max(2, min(30, eq_dc))

        bundle_alive = statistics.mean(bundle_score(r) for r in alive)
        e_score = statistics.mean(bundle_score(r) for r in results)
        e_scores[bail_at] = e_score

        print(
            f"{bail_at:>4} | {p_alive*100:>7.1f}% | {p_disc_here*100:>6.2f}% | "
            f"{avg_succ:>5.2f} | {avg_dc:>6.2f} | {avg_ins:>4.2f} | "
            f"DC{eq_dc:>3} | {bundle_alive:>8.1f} | {e_score:>11.1f}"
        )

    print()
    print("*   Eq.DC      = flat 1d20+INV DC with same P(success) as bailing alive at N.")
    print("**  bundle     = avg score IF you bail alive (successes×5 + DCdrop×1 + ins×3).")
    print("*** E[score]   = expected score over all outcomes (discovered → 0). The peak")
    print("                 of this column is the mathematically optimal bail tick.")
    print()
    _decision_cards()
    print()
    _print_amplification_menu()
    print()
    _tune_verdict(rng, e_scores)


def _decision_cards() -> None:
    print("=== DECISION CARDS (per die tier) ===")
    print("Hand these to the player so they can read their odds at each tier.")
    print()
    print(f"  {'Tier':>9} | {'P(strike)':>9} | {'P(demote)':>9} | "
          f"{'P(end run)':>10} | {'DC drop/tick':>12} | {'Insight/tick':>12}")
    print("  " + "-" * 78)
    p_save = _p_dec_save()
    for die in DIE_LADDER:
        p_strike = min(STRIKE_THRESHOLD, die) / die
        p_dem = _p_demote_per_tick(die)
        p_end = 0.0
        dc_drop = DC_REDUCTION[die]
        ins_per_tick = "—" if die == 20 else "+1"
        print(
            f"  {'d'+str(die):>9} | {p_strike*100:>8.1f}% | {p_dem*100:>8.1f}% | "
            f"{p_end*100:>9.1f}% | {'-' + str(dc_drop):>12} | "
            f"{ins_per_tick:>12}"
        )
    p_caught = 1 - p_save
    print(
        f"  {'tightrope':>9} | {'(always)':>9} | {'  -':>9} | "
        f"{p_caught*100:>9.1f}% | {'  -':>12} | {'+1 if pass':>12}"
    )


def _tier_expectations(rng: random.Random) -> None:
    runs = [simulate_run(rng) for _ in range(SIM_TRIALS)]
    print("=== TIER EXPECTATIONS (full-push runs) ===")
    print("  Avg ticks at each tier and how often the run reached it:")
    tiers: list[tuple[str, int]] = [(f"d{d}", d) for d in DIE_LADDER]
    tiers.append(("tightrope", TIGHTROPE_TIER))
    for label, d in tiers:
        per_run = [sum(1 for t in r.ticks if t.die == d) for r in runs]
        visited = sum(1 for c in per_run if c > 0) / len(per_run) * 100
        avg = statistics.mean(per_run)
        avg_when_visited = (
            statistics.mean(c for c in per_run if c > 0) if visited > 0 else 0
        )
        print(
            f"    {label:>9}: visited {visited:>4.0f}% of runs  |  "
            f"avg {avg:>4.1f} ticks overall  |  "
            f"avg {avg_when_visited:>4.1f} ticks when visited"
        )


def _tune_verdict(rng: random.Random, e_scores: dict[int, float]) -> None:
    full_runs = [simulate_run(rng) for _ in range(SIM_TRIALS)]
    p_disc_overall = sum(1 for r in full_runs if r.discovered) / SIM_TRIALS
    p_floor = sum(
        1 for r in full_runs if r.dc_reduction >= BASE_DC - DC_FLOOR
    ) / SIM_TRIALS
    avg_run_len = statistics.mean(r.bailed_at for r in full_runs)

    print()
    _tier_expectations(rng)
    print()
    print("=== Tuning verdict ===")
    print(f"  Push-to-the-end runs (no voluntary bail):")
    print(f"    P(caught in tightrope)          : {p_disc_overall*100:.1f}%")
    print(f"    P(reached DC floor)             : {p_floor*100:.1f}%")
    print(f"    Avg run length                  : {avg_run_len:.1f} ticks")
    if e_scores:
        optimal = max(e_scores, key=lambda n: e_scores[n])
        print(f"    Optimal bail tick (by E[score]) : {optimal} "
              f"(E[score]={e_scores[optimal]:.1f})")
        if optimal >= MAX_TICKS:
            print("    ⚠ Always-push wins under current config. The reward curve")
            print("       outpaces the risk curve. To create real bail tension:")
            print("       - lower BUNDLE_WEIGHTS['insight'], or")
            print("       - raise DC_FLOOR (less DC progress per run), or")
            print("       - lower DC_REDUCTION values for small dice.")
    if p_disc_overall < 0.15:
        print("  ⚠ Tightrope rarely punishes — challenge may be too soft. "
              "Consider raising DECEPTION_DC or extending MAX_TICKS.")
    if p_floor > 0.7:
        print("  ⚠ Players bottom out the DC most runs — "
              "raise DC_FLOOR or shorten DC_REDUCTION values.")
    if 0.15 <= p_disc_overall <= 0.40 and p_floor <= 0.7:
        print("  ✓ Push-to-end pressure looks well balanced.")


def print_player_rules() -> None:
    print("=" * 76)
    print("HOW TO PLAY  —  hand this to your players")
    print("=" * 76)
    print()
    print("You're doing something that takes time and risks getting caught")
    print("(research, infiltration, casing a place, social maneuvering, etc.).")
    print("Each tick of in-fiction time is one roll:")
    print()
    print("  1. Roll d20 + Investigation (or whatever skill the GM names).")
    print()
    print("  2. If the raw die shows 5 or less, you've drawn suspicion.")
    print("     Roll Deception DC 15 to keep your cover.")
    print("       Pass -> nothing happens. Tick again next turn.")
    print("       Fail -> demote one step on this ladder:")
    print("                 d20 -> d12 -> d10 -> d8 -> d6 -> d4 -> tightrope")
    print()
    print("  3. The longer you stay, the better the payoff:")
    print("       While on d20: each tick lowers the DC by 1. Non-strike")
    print("                     rolls also count as a 'success' (cool intel).")
    print("       Once demoted: each tick lowers the DC faster (d12 -2,")
    print("                     d10 -3, d8 -4, d6 -5, d4 -6) AND earns")
    print("                     +1 Insight Point.")
    print()
    print("  4. If you're at d4 and would demote, you enter TIGHTROPE.")
    print("     You're not rolling the die anymore. Each tick is just")
    print("     Deception DC 15:")
    print("       Pass -> +1 Insight Point. Tick again.")
    print("       Fail -> caught. Run ends. You walk away with nothing.")
    print()
    print("  5. You can bail any time. Whatever you've earned is yours.")
    print()
    print("=" * 76)
    print()


def _print_amplification_menu() -> None:
    print("=== Insight Point menu ===")
    print("  1 pt  Tangent       unexpected detail in an adjacent topic")
    print("  2 pt  Widen         findings cover a related domain too")
    print("  2 pt  Sharpen       upgrade one d20 success to critical")
    print("  3 pt  Cross-ref     connect two successes; reveal an implication")
    print("  8 pt  Breakthrough  groundbreaking / secret intel")
    print("  *     GM call       anything else thematically appropriate")


# ============================================================================
# Score mode
# ============================================================================

def score() -> None:
    print_player_rules()
    print("=== SCORING REAL SESSION ===")
    print(
        f"Config: BASE_DC={BASE_DC}, DC_FLOOR={DC_FLOOR}, "
        f"INV={INV_MOD:+d}, DEC={DEC_MOD:+d}{' (adv)' if DEC_ADVANTAGE else ''}"
    )
    print()

    successes = 0
    dc_reduction = 0
    insight_pts = 0
    total_value = 0
    expected_total = 0.0
    discovered = False
    strikes = 0
    heroic_used_global = False
    notes: list[str] = []
    deviations: list[tuple[int, float]] = []  # (tick, deviation_from_expected)

    last_die: int | str = DIE_LADDER[0]
    in_tightrope = False
    tick_rows: list[dict] = []
    for i, roll in enumerate(ACTUAL_ROLLS, start=1):
        die = roll["die"]
        last_die = die

        if die == "tightrope" or die == 0:
            in_tightrope = True
            dec = roll.get("deception")
            if dec is None:
                discovered = True
                tick_rows.append({
                    "tick": i, "tier": "tightrope", "roll_str": "Dec only",
                    "succ": "—", "dDC": "—", "ins": "—",
                    "outcome": "Dec missing → assumed CAUGHT",
                })
                break
            if DEC_ADVANTAGE and len(dec) == 2:
                dec_total = max(dec) + DEC_MOD
                dec_desc = f"adv {dec[0]}/{dec[1]}{DEC_MOD:+d}={dec_total}"
            else:
                dec_total = dec[0] + DEC_MOD
                dec_desc = f"{dec[0]}{DEC_MOD:+d}={dec_total}"
            passed = dec_total >= DECEPTION_DC
            if passed:
                insight_pts += 1
                tick_rows.append({
                    "tick": i, "tier": "tightrope", "roll_str": "Dec only",
                    "succ": "—", "dDC": "—", "ins": "+1",
                    "outcome": f"Dec {dec_desc} → PASS",
                })
            else:
                discovered = True
                tick_rows.append({
                    "tick": i, "tier": "tightrope", "roll_str": "Dec only",
                    "succ": "—", "dDC": "—", "ins": "—",
                    "outcome": f"Dec {dec_desc} → FAIL → CAUGHT",
                })
            continue

        raw = roll["raw"]
        heroic_reroll = roll.get("heroic_reroll")
        original_raw = raw
        hi_used_here = False

        if heroic_reroll is not None:
            if heroic_used_global:
                notes.append(f"  Tick {i}: heroic_reroll given but HI already used — ignoring")
            else:
                heroic_used_global = True
                hi_used_here = True
                if raw == NAT_FAIL_VALUE and heroic_reroll == NAT_FAIL_VALUE:
                    notes.append(
                        f"  Tick {i}: HI burned on nat-1, rerolled another nat-1 — "
                        f"P(both) = 1/{die*die} = {100/(die*die):.2f}%"
                    )
                raw = heroic_reroll

        total = raw + INV_MOD
        total_value += total
        expected_die = (die + 1) / 2 + INV_MOD
        expected_total += expected_die
        deviations.append((i, total - expected_die))

        is_strike = raw <= STRIKE_THRESHOLD
        save_passed = True
        save_outcome = "—"

        if is_strike:
            strikes += 1
            dec = roll.get("deception")
            if dec is None:
                save_passed = False
                save_outcome = "Dec missing → demoted"
            else:
                if DEC_ADVANTAGE and len(dec) == 2:
                    dec_total = max(dec) + DEC_MOD
                    dec_desc = f"adv {dec[0]}/{dec[1]}{DEC_MOD:+d}={dec_total}"
                else:
                    dec_total = dec[0] + DEC_MOD
                    dec_desc = f"{dec[0]}{DEC_MOD:+d}={dec_total}"
                save_passed = dec_total >= DECEPTION_DC
                if save_passed:
                    save_outcome = f"Dec {dec_desc} → PASS"
                else:
                    save_outcome = f"Dec {dec_desc} → FAIL → demoted"

        delta_dc_str = "—"
        ins_str = "—"
        if not discovered:
            if dc_reduction < BASE_DC - DC_FLOOR:
                dropped = min(DC_REDUCTION[die], BASE_DC - DC_FLOOR - dc_reduction)
                dc_reduction += dropped
                delta_dc_str = f"-{dropped}"

            if die != 20:
                insight_pts += 1
                ins_str = "+1"

            if die == 20 and not is_strike:
                successes += 1
                succ_str = "✓"
            elif die == 20 and is_strike:
                succ_str = "✗"
            else:
                succ_str = "—"
        else:
            succ_str = "—"

        if hi_used_here:
            roll_str = f"{original_raw}→{raw}HI(+{INV_MOD}={total})"
        else:
            roll_str = f"{raw}(+{INV_MOD}={total})"

        tick_rows.append({
            "tick": i, "tier": f"d{die}", "roll_str": roll_str,
            "succ": succ_str, "dDC": delta_dc_str, "ins": ins_str,
            "outcome": save_outcome,
        })

    bail_at = len(ACTUAL_ROLLS)

    print(f"Bailed at tick {bail_at}{' (DISCOVERED)' if discovered else ''}")
    print()
    print("Outcome bundle:")
    print(f"  Successes      : {successes}")
    print(f"  DC reduction   : -{dc_reduction}  ->  final DC {BASE_DC - dc_reduction}")
    print(f"  Insight Points : {insight_pts}")
    print(f"  Total roll val : {total_value}")
    bs = (0 if discovered else
          BUNDLE_WEIGHTS["success"] * successes
          + BUNDLE_WEIGHTS["dc_drop"] * dc_reduction
          + BUNDLE_WEIGHTS["insight"] * insight_pts)
    if discovered:
        print(f"  Bundle score   : 0.0  (caught — bundle zeroed)")
    else:
        print(
            f"  Bundle score   : {bs:.1f}  =  "
            f"{successes}×{BUNDLE_WEIGHTS['success']} (succ) + "
            f"{dc_reduction}×{BUNDLE_WEIGHTS['dc_drop']} (DC drop) + "
            f"{insight_pts}×{BUNDLE_WEIGHTS['insight']} (insight)"
        )

    print()
    print("Per-tick breakdown:")
    print(f"  {'#':>2}  {'Tier':<9}  {'Roll':<22}  "
          f"{'d20 succ':<8}  {'ΔDC':>4}  {'Ins':>4}  Save outcome")
    print("  " + "-" * 92)
    for r in tick_rows:
        print(
            f"  {r['tick']:>2}  {r['tier']:<9}  {r['roll_str']:<22}  "
            f"{r['succ']:<8}  {r['dDC']:>4}  {r['ins']:>4}  {r['outcome']}"
        )

    print()
    print("Luck analysis:")
    delta = total_value - expected_total
    pct = (delta / expected_total * 100) if expected_total else 0.0
    print(f"  Expected for this path : {expected_total:.1f}")
    print(f"  Actual                 : {total_value} ({pct:+.1f}%)")

    path_var = sum(((r["die"] ** 2 - 1) / 12) for r in ACTUAL_ROLLS[:bail_at])
    sd = math.sqrt(path_var) if path_var > 0 else 1.0
    z = delta / sd
    print(f"  Z-score                : {z:+.2f}  ({_luck_label(z)})")

    expected_strikes = sum(STRIKE_THRESHOLD / r["die"] for r in ACTUAL_ROLLS[:bail_at])
    print(f"  Strikes                : {strikes}  (expected ~{expected_strikes:.1f})")

    if deviations:
        worst = min(deviations, key=lambda x: x[1])
        best = max(deviations, key=lambda x: x[1])
        print(f"  Worst single roll      : tick {worst[0]} ({worst[1]:+.1f} vs expected)")
        print(f"  Best single roll       : tick {best[0]} ({best[1]:+.1f} vs expected)")

        if abs(worst[1]) > 0.5 * sd:
            stripped = delta - worst[1]
            print(
                f"  Without worst roll     : run was "
                f"{stripped:+.1f} vs expected — "
                f"{'unremarkable noise' if abs(stripped) < sd else 'still notable'}"
            )

    if notes:
        print()
        print("Tick notes:")
        for n in notes:
            print(n)

    if not discovered and ACTUAL_ROLLS:
        if in_tightrope:
            _bail_decision_tightrope(strikes)
        elif isinstance(last_die, int):
            _bail_decision_analysis(last_die, strikes)

    if insight_pts > 0:
        print()
        _print_amplification_menu()


def _bail_decision_tightrope(strikes_so_far: int) -> None:
    p_dec = _p_dec_save()
    p_caught = 1 - p_dec
    print()
    print("Bail decision analysis:")
    print(f"  At bail point, in TIGHTROPE after {strikes_so_far} strike(s):")
    print(f"    P(caught next tick)     : {p_caught*100:.1f}%")
    print(f"    P(another Insight)      : {p_dec*100:.1f}%")
    if p_caught >= 0.50:
        print("  Verdict: BAIL is overwhelmingly correct — coin-flip-or-worse.")
    else:
        print("  Verdict: BAILING WAS WISE — every tick risks losing it all.")


def _bail_decision_analysis(current_die: int, strikes_so_far: int) -> None:
    p_strike = min(STRIKE_THRESHOLD, current_die) / current_die
    p_dec = _p_dec_save()
    p_demote = p_strike * (1 - p_dec)
    avg_dc_drop_per_tick = DC_REDUCTION[current_die]
    tier_idx = DIE_LADDER.index(current_die)
    tiers_to_tightrope = len(DIE_LADDER) - tier_idx

    print()
    print("Bail decision analysis:")
    print(f"  At bail point, on d{current_die} after {strikes_so_far} strike(s):")
    print(f"    P(strike next tick)        : {p_strike*100:.1f}%")
    print(f"    P(deception saves)         : {p_dec*100:.1f}%")
    print(f"    P(demote next tick)        : {p_demote*100:.1f}%")
    print(f"    Avg DC drop next tick      : -{avg_dc_drop_per_tick}")
    print(f"    Demotions until tightrope  : {tiers_to_tightrope}")
    if tiers_to_tightrope <= 1:
        print("  Verdict: BAIL is wise — one failed save = tightrope.")
    elif tiers_to_tightrope <= 2:
        print("  Verdict: REASONABLE BAIL — two demotions away from tightrope.")
    else:
        print("  Verdict: COULD HAVE PUSHED — tightrope is far off.")


def _luck_label(z: float) -> str:
    if z >= 1.5:  return "very lucky (top ~7%)"
    if z >= 0.5:  return "lucky (above average)"
    if z >= -0.5: return "average"
    if z >= -1.5: return "unlucky (below average)"
    return "very unlucky (bottom ~7%)"


# ============================================================================

def main() -> None:
    if RULES_ONLY:
        print_player_rules()
        return
    if ACTUAL_ROLLS:
        score()
    else:
        tune()


if __name__ == "__main__":
    main()
