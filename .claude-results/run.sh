# Build, serve, and test the new screens in a real browser.
npm run build >/dev/null 2>&1 || echo "build failed (see build section)"
(npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &)
npm i --no-save --no-audit --no-fund playwright@1 >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1 && echo "playwright ready"
sleep 3
SHOTS="$RUNNER_TEMP/shots" timeout 600 node .claude-results/shots.mjs 2>&1 | tail -40
