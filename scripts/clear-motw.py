#!/usr/bin/env python3
#
# Currently VSBloom's native binaries (under `build-native/`)
# are built by the `build-native-binaries.yml` GitHub Actions
# workflow, then manually downloaded to a local machine's
# VSBloom repository and placed into the `build-native/`
# directory accordingly before packaging the extension for
# any new releases, whenever the binaries en up being updated.
#
# Due to this download process from GitHub Actions, the binaries
# themselves are very likely to be marked with a protective
# indicator from Microsoft called the 'Mark of the Web' (MotW)
# which acts as a protective measure against potential online
# downloaded binarines that don't have good intentions - it
# signals to SmartScreen that the file is from the internet
# and makes a foreboding warning much, much more likely to
# appear to the user depending on many factors that go into
# the VSBloom extension's binary build process, the `.vsix`
# packaging process, and the binaries signature & associated
# pre-existing reputation with Microsoft.
#
# This script removes that MotW indicator from all binaries under
# the `build-native/` directory accordingly, intended to be run
# after the aforementioned manual download process from GitHub
# Actions, and before packaging the extension for any new releases.
# It may or may not prevent the MotW from showing back up on end-user
# machines depending on how `.vsix` files are distributed and unpacked
# internally by VSCode, but - at the very least - we don't want to have
# it already present before the extension even gets published to the
# VSCode Marketplace.

from __future__ import annotations

import argparse
import os
import platform
import sys
from pathlib import Path

MOTW_STREAM_NAME = "Zone.Identifier"

def IsWindows() -> bool:
    return platform.system().lower() == "windows"

def DoesPathHaveMotW(path: Path) -> bool:
    ads_path = f"{path}:{MOTW_STREAM_NAME}"

    try:
        with open(ads_path, "rb"):
            return True
    except FileNotFoundError:
        return False
    except OSError:
        return False


def RemoveMotW(path: Path) -> bool:
    ads_path = f"{path}:{MOTW_STREAM_NAME}"

    try:
        os.remove(ads_path)
        return True
    except FileNotFoundError:
        return False
    except OSError as exc:
        print(f"Failed to remove MOTW from {path}: {exc}", file=sys.stderr)
        return False


def WalkFiles(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip common junk directories.
        dirnames[:] = [
            d for d in dirnames
            if d not in {".git", "node_modules", ".pnpm-store"}
        ]

        for filename in filenames:
            yield Path(dirpath) / filename


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Removes Microsoft's 'Mark of the Web' (MotW) Zone.Identifier streams from files in a directory. See the script's header for more information on why we do this."
    )

    parser.add_argument(
        "path",
        nargs="?",
        default="build-native",
        help="Directory to scan. Defaults to ./build-native",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show files that would be cleaned, but do not modify anything.",
    )

    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on non-Windows platforms instead of no-oping.",
    )

    args = parser.parse_args()

    root = Path(args.path).resolve()

    if not root.exists():
        print(f"Path does not exist: {root}", file=sys.stderr)
        return 1

    if not root.is_dir():
        print(f"Path is not a directory: {root}", file=sys.stderr)
        return 1

    if not IsWindows():
        message = (
            "[MotW] Running on non-Windows platform; MotW Zone.Identifier ADS cleanup "
            "is only meaningful on Windows/NTFS, assuming nothing to do."
        )

        if args.strict:
            print(message, file=sys.stderr)
            return 1

        print(message)
        return 0

    checked = 0
    found = 0
    removed = 0

    print(f"[MotW] Scanning for MotW under: {root}")

    for file_path in WalkFiles(root):
        checked += 1

        if DoesPathHaveMotW(file_path):
            found += 1
            print(f"[MotW] MotW found: {file_path}")

            if args.dry_run:
                continue

            if RemoveMotW(file_path):
                removed += 1
                print("[MotW]   - Removed Zone.Identifier")

    print()
    print("[MotW] Completed")
    print(f"[MotW]   - Files checked: {checked}")
    print(f"[MotW]   - MotW streams found: {found}")

    if args.dry_run:
        print("[MotW] (Dry run only; no files modified)")
    else:
        print(f"[MotW]   - MotW streams removed: {removed}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())