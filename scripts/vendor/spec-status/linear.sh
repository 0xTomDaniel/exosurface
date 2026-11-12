#!/usr/bin/env bash
# lane-key ID: the lane key for a Linear issue as the owner writes it (ENG-123, eng-123 or its URL): eng-123 (docs/adr/0011).
set -euo pipefail
[[ $# == 1 ]] || { echo "usage: lane-key ID" >&2; exit 64; }
[[ "$1" =~ ^(https://linear\.app/[^/]+/issue/)?([A-Za-z][A-Za-z0-9]*-[0-9]+)(/[^/]*)?/?$ ]] \
  || { echo "lane-key: $1 is not a Linear issue key (TEAM-123)" >&2; exit 1; }
echo "${BASH_REMATCH[2],,}"
