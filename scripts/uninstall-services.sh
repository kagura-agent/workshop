#!/bin/bash
# Uninstall workshop systemd user units.

set -euo pipefail

UNIT_DIR="$HOME/.config/systemd/user"

echo "==> Uninstalling workshop systemd user units"

systemctl --user stop workshop-server workshop-web 2>/dev/null || true
echo "    Stopped services"

systemctl --user disable workshop-server workshop-web 2>/dev/null || true
echo "    Disabled services"

rm -f "$UNIT_DIR/workshop-server.service" "$UNIT_DIR/workshop-web.service"
echo "    Removed unit files"

systemctl --user daemon-reload
echo "    Reloaded systemd user daemon"

echo ""
echo "Done. Workshop services have been removed."
