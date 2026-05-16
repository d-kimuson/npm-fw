#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_root=$(cd "$script_dir/../.." && pwd)
temp_dir="$project_root/temp-pack"
temp_cache_dir="$temp_dir/npm-cache"
temp_bin_file="$temp_dir/npm-fw"

echo "==> Preparing temp package directory: $temp_dir"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"

echo "==> Building npm-fw"
(
  cd "$project_root"
  pnpm build
)

echo "==> Packing npm-fw"
(
  cd "$project_root"
  npm pack --pack-destination "$temp_dir" --ignore-scripts
)

output_file=$(find "$temp_dir" -maxdepth 1 -type f -name '*.tgz' | sort | tail -n 1)
if [ -z "$output_file" ]; then
  echo "error: npm pack did not create a tarball in $temp_dir" >&2
  exit 1
fi

cat > "$temp_bin_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail

cache_dir="$temp_cache_dir"
package_file="$output_file"

# Always use an empty cache to approximate a fresh npx install.
rm -rf "\$cache_dir"
mkdir -p "\$cache_dir"

exec npx --yes --cache "\$cache_dir" --package "\$package_file" npm-fw "\$@"
EOF

chmod +x "$temp_bin_file"

cat <<EOF

Packed package is ready.
  tarball: $output_file
  runner:  $temp_bin_file

Examples:
  $temp_bin_file --help
  $temp_bin_file npm install axios
  $temp_bin_file doctor

EOF
