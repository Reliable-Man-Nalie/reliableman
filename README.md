# Reliable Man

Nalie's website. Next.js 16 (App Router), React 19.

| Page | Path | Files |
|---|---|---|
| Landing page, English | `/nalie` (the domain root `/` opens it) | `app/nalie/` |
| Landing page, German | `/nalie-de` | `app/nalie-de/` |

Every word is in `app/nalie/content.ts`. Where applications go is set in
`app/nalie/config.ts` (see `app/nalie/README.md`).

## Put it online (Vercel)

1. vercel.com → Add New → Project → import `Reliable-Man-Nalie/reliableman`.
2. Framework preset: Next.js (auto-detected). No environment variables needed.
3. Deploy, then add your domain under Project → Settings → Domains.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```
