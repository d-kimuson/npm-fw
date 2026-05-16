#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_root=$(cd "$script_dir/../.." && pwd)
runner="$project_root/temp-pack/npm-fw"

"$script_dir/pack.sh"

echo "==> Checking packed npm-fw CLI"
"$runner" --help >/dev/null
"$runner" doctor >/dev/null 2>&1 || true

echo "==> Running packed npm-fw doctor"
"$runner" doctor 2>&1 || true

echo "Packed npm-fw smoke check passed."
