# The one gate (AGENTS.md): agents run `just check` before hand-off.

set shell := ["bash", "-euo", "pipefail", "-c"]

pkg := "plugins/bb-plugin-exo-a2ui-spike"

default:
    @just --list

# Install the package's dependencies from its lockfile.
setup:
    cd {{pkg}} && npm ci

# The package check: hard gates clean, counted gates at or below its committed baseline.
check:
    cd {{pkg}} && just check

# Integrate worker commits onto lane gh<N> (octo-feather kit script on PATH).
integrate issue +refs:
    octo-feather-integrate {{issue}} {{refs}}

# Product QC on the lane head: passed criteria become built (octo-feather kit script on PATH; never in check).
qc status pr +ids:
    octo-feather-qc {{status}} {{pr}} {{ids}}
