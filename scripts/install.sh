#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="${1:-afclijohfgakkgmodcdanimdnhppoljc}"

echo "Installing Aria2 Native Messaging Host..."
node "$DIR/register-host.mjs" "$EXT_ID"
