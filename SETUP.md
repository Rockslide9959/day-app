# Deploying Day

The app already runs locally against your real Neon database (tested and working). These are the remaining steps to get it live on the internet and installed on your phone.

**Do not commit `.env` or `.env.local`** — they hold real secrets (DB password, VAPID keys) and are already in `.gitignore`. When copying values into Vercel below, copy them from those files rather than retyping.

## 1. Push the code to GitHub

1. Create a new **empty** repo on GitHub (no README/license — this project already has files).
2. In this project folder, run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 2. Import into Vercel

1. Go to vercel.com, sign in (GitHub sign-in is easiest), click **Add New → Project**, and import the repo you just pushed.
2. Before the first deploy, open **Environment Variables** and add these (copy the values from your local `.env` / `.env.local`):

| Key | Value |
|---|---|
| `DATABASE_URL` | your Neon connection string |
| `APP_PASSCODE` | **change this from the `1234` placeholder** to a real PIN before deploying |
| `CRON_SECRET` | the long random string already in `.env.local` |
| `VAPID_PUBLIC_KEY` | from `.env.local` |
| `VAPID_PRIVATE_KEY` | from `.env.local` |
| `VAPID_SUBJECT` | from `.env.local` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same value as `VAPID_PUBLIC_KEY` |

3. Click **Deploy**. Your app will be live at `https://<project>.vercel.app`.

The database is already migrated (we ran it against this same Neon DB during local testing), so no extra migration step is needed for this first deploy. If you change `prisma/schema.prisma` later, run `npx prisma migrate deploy` locally (with `.env` pointing at the same `DATABASE_URL`) to apply the change to production.

## 3. Set up the reminder-check cron (cron-job.org)

Vercel's free plan only runs cron jobs once a day, which isn't enough for timely reminders, so we use a free external pinger instead.

1. Go to cron-job.org and create a free account.
2. Create a new cron job:
   - **URL**: `https://<your-app>.vercel.app/api/cron/tick?secret=<your CRON_SECRET value>`
   - **Schedule**: every 1 minute
3. Save it. From then on, this job checks for due reminders and sends push notifications every minute.

## 4. Install it on your Android phone

1. Open `https://day-app-six.vercel.app` in Chrome on your phone.
2. Enter your passcode.
3. Tap the Chrome menu (⋮) → **Add to Home Screen** → **Install**. This makes it a real installed app, which Android needs for reliable background push notifications.
4. Open the installed app from your home screen, go to **Reminders**, and tap **Turn on** under Notifications. Allow the permission prompt.
5. To verify end-to-end: create a reminder ~2 minutes in the future and lock your phone. The notification should arrive on schedule.

## Local development

```bash
npm run dev
```

Requires `.env` (for Prisma CLI) and `.env.local` (for the Next.js app) to both have `DATABASE_URL` set — already configured to point at your Neon database.

To view/edit the database directly:

```bash
npx prisma studio
```
