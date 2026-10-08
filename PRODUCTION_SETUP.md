# RAM Engineering CRM production setup

> **Existing installations:** apply pending files in `supabase/migrations/` in timestamp order before releasing compatible code. Do not rerun the older `supabase/setup.sql` over a migrated installation: it can replace newer RPCs and role constraints.

Use this checklist when the client sends access to the production accounts.

## What you need from the client

Required now:

- Cloudflare account access
- Supabase project access

Required when Google synchronization is enabled:

- Google Cloud project access
- Google Workspace account that will be connected to Gmail, Calendar and Drive

Values you will copy from Supabase:

- Project URL
- Publishable/anon key for the frontend
- Secret key (`sb_secret_...`) for the Cloudflare Worker only

Never put the Supabase secret key in `.env.local`, frontend code, screenshots, chat messages, or the CRM settings UI.

## First production setup

### 1. Supabase database

Open the client Supabase project, go to SQL Editor, and run the entire current file:

`supabase/setup.sql`

For a fresh installation, follow the baseline with every file in `supabase/migrations/` in timestamp order. Existing installations use only pending migrations.

This creates the organization membership model, roles, RLS rules, shared workspace state, Realtime publication, and the private `crm-files` Storage bucket.

### 2. Deploy to Cloudflare

From the repository root on Windows run:

```bat
deploy.cmd
```

During the script configure both Worker secrets when asked:

- `ADMIN_SETUP_TOKEN`: any long random setup token used only for the first configuration screen
- `SUPABASE_SECRET_KEY`: the client Supabase `sb_secret_...` key

The secret key stays in Cloudflare Worker secrets and is used for server-side user invitations. It is never sent to the browser.

Copy the final HTTPS Worker/domain URL after deployment.

### 3. Configure Supabase Auth URLs

In Supabase go to Authentication > URL Configuration.

Set the production Site URL to the final CRM URL and allow the invite callback URL:

```text
https://rameng-crm.rameng-crm-worker.workers.dev/?invite=1
```

Keep public self-signup disabled. Users should be invited from the CRM.

### 4. Configure the CRM

Open the deployed CRM URL. The first-run setup screen will ask for:

- `ADMIN_SETUP_TOKEN`
- Supabase Project URL
- Supabase publishable/anon key
- developer email

Google credentials can be left empty until Google synchronization is ready.

### 5. Create the developer login

For the very first account only, create or invite the developer email from Supabase Authentication > Users. The first successful login initializes the RAM organization. The CRM/Worker then treats the configured developer email as the protected developer account.

After this first account exists, all normal RAM users are created from `משתמשים והרשאות` inside the CRM. New emails are invited through Supabase automatically; existing Supabase users are linked to the RAM organization.

### 6. Test before client handoff

Confirm all of the following:

- developer can log in and sees developer settings
- admin can manage normal users but cannot modify the developer account
- a test invited user receives the invite email and can set a password
- viewer cannot edit CRM data
- creating a client, project, task and report survives a page refresh
- two logged-in users see shared workspace updates
- file upload works in the private `crm-files` bucket

Delete or disable the test user after verification.

## Google synchronization later

In a company-controlled Google Cloud project, enable Gmail API, Google Calendar API and Google Drive API. Configure the OAuth consent screen and create one OAuth Web Application. Google requires this OAuth client to be created manually in Google Cloud Console; the CRM cannot create it automatically. Add this exact authorized redirect URI:

```text
https://rameng-crm.rameng-crm-worker.workers.dev/api/google/callback
```

The developer can grant a trusted user `Google Workspace — connection and setup` permissions from Users → Permissions:

- `View` allows that user to connect their own Google account.
- `Edit` also displays the dedicated Google-only setup panel, where the user can enter the Client ID and Client Secret. It does not expose Supabase, code, or other infrastructure settings.

After the shared OAuth application is configured once, every CRM user with `View` permission connects their own Google account using the single Google sign-in button. Tokens are isolated by Supabase user ID; Gmail, Calendar, and Drive actions always use the currently signed-in user's Google account.

## Normal update flow after production is configured

For code-only updates:

```bat
git pull
npm run build
deploy.cmd
```

For database updates, back up the workspace and apply pending incremental migrations before testing the new functionality. Do not rerun the baseline on an already migrated database.
