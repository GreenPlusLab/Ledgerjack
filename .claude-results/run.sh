git checkout -- package.json package-lock.json 2>/dev/null
npm install --save-dev --no-audit --no-fund vite@^8.3.5 @vitejs/plugin-react@^6.2.1 vitest@^5.1.0 @vitest/coverage-v8@^5.1.0 happy-dom@^21.0.4 vite-plugin-pwa@^2.0.0 postcss@^8.5.32 autoprefixer@^10.6.2 typescript-eslint@^8.72.1 2>&1 | tail -25
npm ls vite vitest @vitejs/plugin-react vite-plugin-pwa happy-dom 2>&1 | head -20
