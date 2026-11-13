#!/usr/bin/env bash
# lane-key ID: the lane key for a GitHub issue as the owner writes it (82, #82, gh82 or its URL): gh82 (docs/adr/0011).
set -euo pipefail
[[ $# == 1 ]] || { echo "usage: lane-key ID" >&2; exit 64; }
[[ "$1" =~ ^(https://github\.com/[^/]+/[^/]+/issues/|#|gh)?([0-9]+)/?$ ]] \
  || { echo "lane-key: $1 is not a GitHub issue number" >&2; exit 1; }
echo "gh${BASH_REMATCH[2]}"
