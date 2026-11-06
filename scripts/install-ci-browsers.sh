#!/usr/bin/env bash
set -euo pipefail

# The hosted Ubuntu Azure HTTP mirror delivered browser dependencies at about
# 40 KB/s and exhausted acceptance's 25-minute timeout. Use Ubuntu's official
# HTTPS archive instead, retaining the same suites, components and signing keys.
for mirror in /etc/apt/apt-mirrors*.txt /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do
  if [[ -f "$mirror" ]]; then
    sudo sed -i 's|https\?://azure\.archive\.ubuntu\.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' "$mirror"
  fi
done

npx --no-install playwright install --with-deps chromium webkit
