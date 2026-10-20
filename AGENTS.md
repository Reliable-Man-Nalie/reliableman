# For the AI working on this project

Read `CLAUDE-SETUP-GUIDE.md` first. It is the setup plan and the launch plan.

This is Next.js 16 with React 19. Some APIs and conventions differ from older
Next.js (the middleware file is `proxy.ts`). Check `node_modules/next/dist/docs/`
before writing code that touches routing, caching or metadata.

Rules:
- Never ask the owner to paste SQL. Tables come from `db/schema.sql`, applied
  by `scripts/setup-db.mjs` on every build. Add new tables there, idempotent.
- Never send an email, publish or charge anyone without the owner's OK.
- Brand text comes from `lib/brand.ts` (environment variables). Do not hardcode
  a business name, email or bank number in a page.
