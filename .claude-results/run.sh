set -x
npm audit fix --no-fund 2>&1 | tail -30
npm ci --no-audit --no-fund 2>&1 | tail -3
