npm pkg set devDependencies.vite="^8.3.5" devDependencies.@vitejs/plugin-react="^6.2.1" devDependencies.vitest="^5.1.0" devDependencies.@vitest/coverage-v8="^5.1.0" devDependencies.happy-dom="^21.0.4" devDependencies.vite-plugin-pwa="^2.0.0" devDependencies.postcss="^8.5.32" devDependencies.autoprefixer="^10.6.2" devDependencies.typescript-eslint="^8.72.1"
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund 2>&1 | tail -30
for f in /home/runner/.npm/_logs/*eresolve-report.txt; do [ -f "$f" ] && head -60 "$f"; done
npm ls vite vitest @vitejs/plugin-react vite-plugin-pwa happy-dom 2>&1 | head -20
