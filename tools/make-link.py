#!/usr/bin/env python3
"""Make a one-tap Cozy setup link.

The key is typed straight into this terminal (not shown, not saved anywhere).
It ends up only in the link you copy — after the #, where browsers never send it
to a server. Nothing is written to disk, so it never touches the repo.

    python3 tools/make-link.py                 # Gemini (default)
    python3 tools/make-link.py -p openrouter   # OpenRouter
    python3 tools/make-link.py --demo          # practice mode, no key
"""

import argparse
import getpass
import sys
from urllib.parse import quote

BASE = "https://desolatemartial553.github.io/cozy-chat/"


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a Cozy setup link.")
    ap.add_argument("-p", "--provider", choices=["gemini", "openrouter"],
                    default="gemini", help="which provider the key belongs to")
    ap.add_argument("--demo", action="store_true",
                    help="practice mode link (no key at all)")
    ap.add_argument("--base", default=BASE, help="where Cozy is hosted")
    args = ap.parse_args()

    if args.demo:
        link = f"{args.base}#demo=1"
        print("\nPractice-mode link (no key, nothing secret in it):\n")
        print(f"  {link}\n")
        return 0

    print("Paste the API key. It will not appear on screen and is not saved.")
    try:
        key = getpass.getpass("key: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\ncancelled.", file=sys.stderr)
        return 1

    if not key:
        print("no key given.", file=sys.stderr)
        return 1

    link = f"{args.base}#key={quote(key, safe='')}&p={args.provider}"
    print("\nSend this to her phone — privately, her only:\n")
    print(f"  {link}\n")
    print("Anyone who has the link has the key. She opens it once, Cozy tests it,")
    print("saves it on her phone and wipes it from the address bar.")
    print("To undo later: MENU > API key, save a different key.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
