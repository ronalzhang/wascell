#!/bin/sh
# Limit only this website process; do not change host-wide crash or memory policy.
set -eu
ulimit -c 0
if [ -w /proc/self/coredump_filter ]; then
    printf '0\n' > /proc/self/coredump_filter
fi
cd "$(dirname "$0")/.."
exec node --max-old-space-size=256 app.js
