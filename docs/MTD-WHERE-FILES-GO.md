# Where each file goes (keep this open while you place them)

You download one folder, `ledgerjack-mtd-supabase/`. Its inside mirrors your
app's own structure, so most files drop straight into matching folders.

```
ledgerjack-mtd-supabase/
│
├── supabase/functions/hmrc-relay/index.ts
│        → copy into YOUR repo at the SAME path:
│          supabase/functions/hmrc-relay/index.ts
│          (sits next to your existing supabase/functions/ai-proxy/)
│
├── src/lib/mtd/
│     ├── hmrcConfig.ts      ┐
│     ├── mtdVault.ts        │  → copy the whole `mtd` folder into YOUR repo at
│     ├── fraudHeaders.ts    │     src/lib/mtd/  (new folder next to your other lib files)
│     ├── oauth.ts           │
│     └── hmrcClient.ts      ┘
│
├── src/views/mtd/
│     ├── ConnectHmrc.tsx    ┐  → copy into YOUR repo at
│     └── HmrcCallback.tsx   ┘     src/views/mtd/  (new folder next to LockScreen.tsx etc.)
│
├── START-HERE-step-by-step.md   → read this, don't copy into the app
└── WHERE-EACH-FILE-GOES.md      → this file, don't copy into the app
```

## Two things you must fill in before it runs
1. In `src/lib/mtd/hmrcConfig.ts`:
   - `RELAY_BASE` → replace `<PROJECT_REF>` with your Supabase project ref
     (the same one in your ai-proxy URL).
   - `HMRC_CLIENT_ID` → your sandbox Client ID from the HMRC Developer Hub.
   - `REDIRECT_URI` → already set to `https://ledgerjack.com` (the app's main
     address; there is no separate callback page).
2. In the relay (`supabase/functions/hmrc-relay/index.ts`):
   - check the `ALLOWED_ORIGINS` list matches your real app origins.
   - the two secrets (`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`) are NOT in the file —
     you set them with `supabase secrets set` (see START-HERE, Phase 2).

## Where the screens go
No route is needed: `src/App.tsx` spots the return from HMRC on the home page
and shows `HmrcCallback.tsx`. Put `ConnectHmrc.tsx` inside your Settings screen
(only when `showMTD` is true).

Nothing here overwrites your existing files — every item is either a brand-new
file or a brand-new folder.
