# web

The 1 BTC Challenge app: Next.js 16, React 19, Tailwind 4, Supabase Auth + Postgres, Recharts.

```sh
npm install
npm run dev          # needs .env.development.local (see ../CONTRIBUTING.md)
npm run check        # lint (with layer rules), prettier, types, unit tests
npm run db:types     # regenerate src/data/database.types.ts from the local database
```

Structure and rules: [../docs/architecture.md](../docs/architecture.md). Files in
`src/generated/` and `public/data/` come from the engine (`cd ../engine && uv run rotation web-data`).
