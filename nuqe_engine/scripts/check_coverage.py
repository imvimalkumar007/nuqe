#!/usr/bin/env python3
"""
Per-module coverage gate.

Reads coverage.json (produced by pytest --cov-report=json) and fails if any
module in the measured packages falls below the threshold.  The aggregate gate
in pyproject.toml catches the total; this script catches individual modules
that are masked by high-coverage neighbours.

Usage:
    python scripts/check_coverage.py --threshold 80
    python scripts/check_coverage.py           # defaults to 80
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Packages whose modules are checked.  Files outside these prefixes are ignored.
MEASURED_PACKAGES = ("nuqe_engine", "nuqe_api")

# Normalised path prefixes (forward-slash, no leading separator).
_PREFIXES = tuple(p + "/" for p in MEASURED_PACKAGES)


def _is_measured(filepath: str) -> bool:
    """Return True if filepath belongs to one of the measured packages."""
    # coverage.json keys are OS paths relative to the project root.
    normalised = filepath.replace("\\", "/").lstrip("./")
    return any(normalised.startswith(p) for p in _PREFIXES)


def _short_name(filepath: str) -> str:
    normalised = filepath.replace("\\", "/").lstrip("./")
    return normalised


def check(coverage_json: Path, threshold: float) -> int:
    """
    Return the number of modules below the threshold (0 == all good).
    Prints a formatted report regardless.
    """
    if not coverage_json.exists():
        print(
            f"ERROR: {coverage_json} not found. "
            "Run pytest with --cov-report=json first.",
            file=sys.stderr,
        )
        return 1

    data = json.loads(coverage_json.read_text())
    files: dict[str, dict] = data.get("files", {})

    failures: list[tuple[str, float]] = []
    checked = 0

    for filepath, info in sorted(files.items()):
        if not _is_measured(filepath):
            continue
        checked += 1
        pct: float = info["summary"]["percent_covered"]
        if pct < threshold:
            failures.append((_short_name(filepath), pct))

    if checked == 0:
        print(
            "WARNING: no files from the measured packages found in coverage.json.",
            file=sys.stderr,
        )
        return 1

    if failures:
        print(
            f"\nFAIL  Per-module coverage gate FAILED "
            f"(threshold: {threshold:.0f}%)\n"
        )
        col = max(len(f) for f, _ in failures)
        for filepath, pct in failures:
            print(f"  {filepath:<{col}}  {pct:5.1f}%  (need {threshold:.0f}%)")
        print(
            f"\n{len(failures)} module(s) below threshold. "
            f"Checked {checked} module(s) total.\n"
        )
        return len(failures)

    print(
        f"PASS  Per-module coverage gate passed "
        f"({checked} modules, all >={threshold:.0f}%)"
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--threshold",
        type=float,
        default=80.0,
        metavar="PCT",
        help="Minimum coverage percentage per module (default: 80)",
    )
    parser.add_argument(
        "--coverage-json",
        type=Path,
        default=Path("coverage.json"),
        metavar="PATH",
        help="Path to coverage.json (default: coverage.json)",
    )
    args = parser.parse_args()

    failures = check(args.coverage_json, args.threshold)
    sys.exit(min(failures, 1))  # exit 1 on any failure, not N


if __name__ == "__main__":
    main()
