#!/usr/bin/env python3
"""Compatibility entrypoint for legacy CI that calls write_public_redirect_landing.py from repo root."""

from scripts.write_public_redirect_landing import main

if __name__ == "__main__":
    raise SystemExit(main())
