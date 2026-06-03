#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AgentStaking -- deploy helper
# ---------------------------------------------------------------------------
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================"
echo "  AgentStaking -- Deploy to Arc Testnet"
echo "======================================"
echo ""

# Check for .env
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "ERROR: .env file not found. Copy .env.example and fill in your values:"
    echo "  cp .env.example .env"
    exit 1
fi

# Check Python dependencies
echo "[*] Checking Python dependencies ..."
pip install --quiet py-solc-x web3 python-dotenv

# Run the deploy script
echo "[*] Running deployment script ..."
cd "$PROJECT_ROOT"
python3 scripts/deploy.py

echo ""
echo "[*] Done."
