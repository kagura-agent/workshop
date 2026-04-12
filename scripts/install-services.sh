#!/bin/bash
# Install workshop systemd user units for reliable process supervision.
# Replaces the old scripts/supervise.sh approach.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

echo "==> Installing workshop systemd user units"

mkdir -p "$UNIT_DIR"

cp "$SCRIPT_DIR/systemd/workshop-server.service" "$UNIT_DIR/"
cp "$SCRIPT_DIR/systemd/workshop-web.service" "$UNIT_DIR/"
echo "    Copied unit files to $UNIT_DIR"

systemctl --user daemon-reload
echo "    Reloaded systemd user daemon"

systemctl --user enable workshop-server workshop-web
echo "    Enabled services"

systemctl --user start workshop-server workshop-web
echo "    Started services"

echo ""
echo "==> Status:"
systemctl --user status workshop-server workshop-web --no-pager || true
echo ""
echo "Done. Use 'npm run status' to check service health."
