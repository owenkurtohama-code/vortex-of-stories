# Step-by-step setup (follow in order)

Read this whole page once before you start. Steps marked **OWNER** must be done by you. Steps marked **CHECK** confirm something before you continue.

Screens in GitHub and Supabase change over time. If a button name differs, look for the nearest matching word and tell me what you see.

---

## Part A - Remove the old project (OWNER, only after the checklist)

You said nothing from the old build is to be kept. Before deleting, confirm these items once:

1. **CHECK** Open the old GitHub repository `owenkurtohama-code/vortex-of-dread`. Confirm it does not contain writing you need (for example *Alter* chapters). If it does, copy those files somewhere safe first.
2. **CHECK** Open the old Supabase project `hifyejhepphyfpizvwon`. If any table holds writing you want, export it first (Table Editor, or SQL Editor with `select * from <table>`).
3. **OWNER** Delete the old GitHub repository: repository **Settings** → scroll to **Danger Zone** → **Delete this repository**. Type the repository name to confirm.
4. **OWNER** Delete the old Supabase project: open the project → **Project Settings** → **General** → scroll to the bottom → delete project. Confirm with the project name.
5. **OWNER** Deleting these is permanent. Nothing in this guide can recover them.

## Part B - Create the new Supabase project (OWNER)

1. Go to https://supabase.com/dashboard and choose **New project**.
2. Name it, set a strong **database password** and store it in a password manager. Choose a region near your readers.
3. Wait until the project shows as ready.
4. **Authentication → Sign In / Providers → Email**:
   - Enable the Email provider.
   - Turn on **Confirm email**.
   - Set **Minimum password length** to 8.
   - Turn **off** any Google provider (Google Sign-In is dropped).
5. **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-github-username>.github.io/<your-new-repo-name>/` (include the trailing slash).
   - **Redirect URLs:** add the same address.
6. **Authentication → Emails → SMTP:** the default email service is limited. Before real users sign up, configure a custom SMTP provider. Note this as a launch blocker.
7. **CHECK** Keep these values for Part D: **Project URL** and **anon public key** (Project Settings → API). Do **not** copy or share the **service_role** key anywhere.

## Part C - Create the database (OWNER, or ask me for help)

Apply the migrations **in this exact order**, on the new, empty project. Each file runs once. Do not re-run any file.

1. `supabase/migrations/20261020000001_core.sql` - core schema, rules, Premium, first-100 promotion, publishing, main chat
2. `supabase/migrations/20261020000002_coins_provisional.sql` - coins (provisional amounts)
3. `supabase/migrations/20261020000003_library_follows_profiles.sql` - reading library, progress, follows, author profiles, support links
4. `supabase/migrations/20261020000004_book_chat_settings.sql` - book chat, configurable limits, moderation
5. `supabase/migrations/20261020000005_admin_tools.sql` - suspension, member search, entitlement lookup, audit log
6. `supabase/migrations/20261020000006_account_privacy.sql` - account deletion and data export

Option 1 - SQL Editor (simplest): for each file in order, open **SQL Editor → New query**, paste the whole file, click **Run**, and wait for "Success" before starting the next one. If a file fails, stop and send me the exact error. Do not skip ahead.

Option 2 - Supabase CLI (for later changes):
```
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

After all six have run, open `supabase/setup/verify_schema.sql` in the SQL Editor and run it. It only reads data. Each section lists what the result should be. Send me any result that does not match.

Then, to make the admin account, continue with Part E.

## Part D - Prepare the code (OWNER, one time)

1. Create a **new, empty** GitHub repository named for the site (for example `vortex-of-stories`). Set it **Public** (GitHub Pages on a free account needs a public repository).
2. On your computer, open the folder generated for this project (`vortex-of-stories/`).
3. Open a terminal in the folder and run:
```
git init
git add .
git commit -m "Initial Vortex of Stories build"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-new-repo-name>.git
git push -u origin main
```
4. **CHECK** The repository on GitHub shows all files, and **no** `.env` file and **no** `node_modules` folder.
5. In the repository: **Settings → Secrets and variables → Actions → Variables** tab. Add:
   - `VITE_SUPABASE_URL` = your Project URL from Part B step 7.
   - `VITE_SUPABASE_ANON_KEY` = your anon public key from Part B step 7.
   These are stored as variables, not secrets, because the anon key is designed to be public. The service-role key must never go here.
6. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
7. **Actions** tab: the workflow "Deploy website to GitHub Pages" runs on each push to `main`. Wait for a green tick. Note the Pages URL printed by the deploy job.

**Note:** the first build needs `web/package-lock.json` to exist. It is created the first time you run `npm install` inside `web/`. Run this once locally before the first push:
```
cd web
npm install
cd ..
```
then commit `web/package-lock.json` with the rest.

## Part E - Designate the permanent administrator (OWNER)

Do this only after the site is live and you have registered your own account.

1. Open the live website and **Register** your administrator account. Use a username you choose.
2. Open the verification email and click the link. Then **Sign in**.
3. In Supabase, open **SQL Editor → New query**. Open `supabase/setup/designate_admin.sql` from the project folder, paste it in, and run it. It matches the account by the email owenkurtohama@gmail.com, so register with that email.
4. **CHECK** The final query returns exactly one row with an empty `ends_at`. If it returns none, you have not registered or verified yet. If it returns more than one, stop and tell me.
6. Refresh the website. An **Admin** link should now appear in the header.

## Part F - First run checks (OWNER, about 30 minutes)

Work through `docs/04_ACCEPTANCE_TESTS.md`. In short:

1. Open the site in a private browser window (logged out). Confirm the story list loads, the first three chapters open, and chapter 4 asks you to register.
2. Register a test account with a different email. Confirm the verification email arrives. Verify it. Confirm the account now shows your username and can read chapter 4 of an approved book.
3. Submit a Premium order using a test Ko-fi order reference. Confirm nothing becomes Premium yet. Approve it in the Admin page. Confirm Premium appears.
4. Post 10 chat messages and confirm the 11th is refused.

If any check fails, do not continue. Send me the exact message shown and what you did.

## Part G - Launch gate (OWNER)

Do not announce the site until all of these are true:

- [ ] Custom SMTP email provider configured and a verification email has been received.
- [ ] Every test in docs/04 has been run and the results recorded.
- [ ] Terms, privacy policy, copyright, community rules and age policy written and approved by you (spec section 9, item 10).
- [ ] Coin amounts and the open items in spec section 9 are answered, or the coin feature remains switched off.
- [ ] Database backups are enabled for the project (Supabase: Database → Backups; check your plan's limits).
- [ ] You have written down the database password in a secure place outside this repository.

## Part H - Making changes later

- Database changes: create a new migration file with a later date (for example `20261101000001_something.sql`). Never edit an applied migration.
- Website changes: edit, commit, and push to `main`. GitHub Pages redeploys automatically.
- Rollback: revert the commit in Git and push. For the database, use Supabase's backup restore (on a test project first).

## If something goes wrong

- Site shows "Missing VITE_SUPABASE_URL" → Part D step 5 variables are missing or misnamed; re-run the deploy.
- Blank page after deploy → open the browser console; check that the Pages URL includes the repo name and a trailing slash.
- "Sign-in failed" → confirm email verification and that the password is at least 8 characters.
- "Could not load stories" → confirm the migrations ran (Part C) and the project URL is correct.
