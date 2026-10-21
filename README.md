# Vortex of Stories

A story-reading, writing and community website.

- `docs/01_MASTER_SPEC.md` - requirements, decision log, and open items
- `docs/02_ARCHITECTURE.md` - how the pieces fit and what is enforced where
- `docs/03_SETUP_STEPS.md` - step-by-step setup from a blank GitHub and Supabase
- `docs/04_ACCEPTANCE_TESTS.md` - what must be tested before launch

## Layout

```
supabase/
  migrations/      six database migrations, applied in filename order (see docs/03 Part C)
  setup/           designated administrator setup; read-only verification script
web/               React + Vite website
.github/workflows/ automatic deployment to GitHub Pages
docs/              specification, architecture, setup steps, tests
```

## Quick start (local)

```
cd web
npm install
cp .env.example .env.local     # then edit with your new project's URL and anon key
npm run dev
```

Never commit `.env.local`, service-role keys, or real administrator details.
