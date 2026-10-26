# Vortex of Stories

A story-reading, writing and community website, with Premium chapters, coins, riddles, and an installable app.

## What is in this repository

- `docs/01_MASTER_SPEC.md`: requirements, the decision log, and open items
- `docs/02_ARCHITECTURE.md`: how the pieces fit together, and where each rule is enforced
- `docs/03_SETUP_STEPS.md`: step-by-step setup from a blank GitHub and Supabase
- `docs/04_ACCEPTANCE_TESTS.md`: what must be tested before launch
- `supabase/migrations/`: the database, applied in filename order (`20261020000001` to `20261020000011`)
- `supabase/setup/`: the one-time administrator setup and a read-only verification script
- `web/`: the React and Vite website
- `.github/workflows/deploy.yml`: automatic deployment to GitHub Pages

## Layout

```
.github/workflows/   deployment to GitHub Pages
docs/                specification, architecture, setup steps, acceptance tests
supabase/
  migrations/        database schema and rules, applied in order
  setup/             designated administrator setup and verification script
web/
  public/            icons, manifest, offline service worker, artwork
  src/
    components/      shared pieces (chat, riddles, coins, install button)
    lib/             database connection, sign-in state, messages, image helpers
    pages/           every page of the website
```

## Before you start

You need a GitHub account, a Supabase project, and Node.js 22 or later on your computer. The setup guide explains each step.

## Local development (optional)

Only needed if you want to run the site on your own computer:

```
cd web
npm install
cp .env.example .env.local
```

Edit `web/.env.local` with your project's URL and anon key, then run:

```
npm run dev
```

## Publishing

Pushing to the `main` branch deploys the site to GitHub Pages automatically. The deployment reads two repository variables, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, from **Settings → Secrets and variables → Actions → Variables**.

## Rules for this repository

- Never commit `.env` or `.env.local` files, service-role keys, or real administrator details.
- Never edit a migration that has already been applied. Add a new, later migration instead.
- The `web/package-lock.json` file must be committed, because the deployment depends on it.
