#!/bin/bash
# Show status and recent logs for workshop services.

echo "=== Workshop Service Status ==="
echo ""

echo "--- workshop-server ---"
systemctl --user status workshop-server --no-pager 2>/dev/null || echo "  (not installed)"
echo ""

echo "--- workshop-web ---"
systemctl --user status workshop-web --no-pager 2>/dev/null || echo "  (not installed)"
echo ""

echo "=== Recent Logs (last 20 lines each) ==="
echo ""

echo "--- workshop-server logs ---"
journalctl --user -u workshop-server -n 20 --no-pager 2>/dev/null || echo "  (no logs available)"
echo ""

echo "--- workshop-web logs ---"
journalctl --user -u workshop-web -n 20 --no-pager 2>/dev/null || echo "  (no logs available)"
