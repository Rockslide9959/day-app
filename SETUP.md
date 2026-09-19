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
| `AUTH_SECRET` | the long random string already in `.env.local` — changing it later logs everyone out |
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
   - **Schedule**: every 20 minutes
3. Save it. From then on, this job checks for due reminders and sends push notifications every 20 minutes.

### Why every 20 minutes and not every minute

Every tick opens a connection to the Neon database. The Neon free plan gives a
fixed monthly compute allowance (currently **100 compute-hours**) and only lets
the database "scale to zero" (stop billing compute) after **5 minutes** with no
queries. A ping every minute means it never gets that idle window — the compute
runs 24/7 at ~0.25 CU (~180 compute-hours/month), blows past the 100-hour cap
partway through the month, and Neon then suspends the compute. Every page needs
the DB, so the whole app goes down with a "compute time quota exceeded" error.

At a 20-minute interval the database is asleep most of the time (~5 min awake per
tick, then idle), which keeps cron compute use around ~40–55 compute-hours/month
— enough headroom for normal app use on top. The trade-offs:

- **Reminders / plain timers** can fire up to ~20 minutes late. The reminder
  catch-up window (`CATCHUP_WINDOW_MINUTES` in `lib/calendar/reminders.ts`) is set
  to 30 min to cover this — nothing is missed, just delivered on the next tick.
- **"Remind me 5 / 10 minutes before" event reminders** lose precision — pick a
  lead time of 30 min or more for anything you can't afford to get late.
- **Pomodoro** is unaffected while the app is open: `components/timers/TimerCard.tsx`
  advances work↔break and notifies client-side every second. The cron only backs
  this up for when the app is fully closed.

If you later move the database to a plan without a compute cap (or a different
host), you can drop the interval back to every minute and restore
`CATCHUP_WINDOW_MINUTES` to 15.

### If cron-job.org shows "Failed (HTTP error)"

Waking a scaled-to-zero Neon database from cold occasionally takes long enough
that the first query of a tick times out. `app/api/cron/tick/route.ts` runs
each phase (todo rollover, reminders, timers, schedule reminders, daily to-do
nudge) in its own try/catch specifically so one phase's cold-start hiccup
can't take the whole tick down with it — the route only returns a 500 (and
shows up as failed) if every phase failed, which means the database was
genuinely unreachable, not just slow to wake. `DATABASE_URL` also carries
`connect_timeout=20&pool_timeout=20` (up from Prisma's ~5s/10s defaults) to
give a cold Neon compute more room before Prisma gives up — make sure the
`DATABASE_URL` value in Vercel's Environment Variables matches your local
`.env.local` (including these two query params) after pulling this change.

## 4. Install it on your Android phone

1. Open `https://day-app-six.vercel.app` in Chrome on your phone.
2. Log in with your account (or sign up if it's your first time on this device).
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
