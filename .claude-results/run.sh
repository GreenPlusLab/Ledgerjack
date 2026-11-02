npm install --package-lock-only --no-audit --no-fund 2>&1 | tail -5
npm ci --no-audit --no-fund 2>&1 | tail -2
echo "--- versions"
for p in vite vitest @vitest/coverage-v8 @vitejs/plugin-react happy-dom tailwindcss postcss autoprefixer vite-plugin-pwa typescript eslint typescript-eslint; do echo "$p latest=$(npm view $p version)"; done
echo "--- peers"
npm view vitest@latest peerDependencies --json | head -30
npm view @vitejs/plugin-react@latest peerDependencies --json
npm view vite-plugin-pwa@latest peerDependencies --json
npm view @vitest/coverage-v8@latest peerDependencies --json
npm view vite@latest engines --json
echo "--- full audit names"
npm audit --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);for(const [n,v] of Object.entries(j.vulnerabilities||{}))console.log(v.severity.padEnd(9),n,(v.range||""),v.isDirect?"(direct)":"","fix:",typeof v.fixAvailable==="object"?v.fixAvailable.name+"@"+v.fixAvailable.version+(v.fixAvailable.isSemVerMajor?" MAJOR":""):v.fixAvailable)})'
