# RAM Engineering CRM production setup

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

It is written to be safe to run again when the schema is updated.

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
https://YOUR-CRM-DOMAIN/?invite=1
```

For local invitation testing you can also allow:

```text
http://localhost:5173/?invite=1
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

In the client Google Cloud project enable Gmail API, Google Calendar API and Google Drive API. Create one OAuth Web Application and add:

```text
https://YOUR-CRM-DOMAIN/api/google/callback
```

Then enter the Client ID and Client Secret from the developer-only CRM settings and connect the company Google account.

## Normal update flow after production is configured

For code-only updates:

```bat
git pull
npm run build
deploy.cmd
```

You normally do not need to rerun `supabase/setup.sql` unless the update includes a database/schema change. When it does, run the latest complete file before testing the new functionality.
