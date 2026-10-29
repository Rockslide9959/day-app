# Day

A life-management PWA with real accounts: a full calendar (recurring events, categories, priorities, deadlines), a daily to-do list with an optional end-of-day push reminder, and a habit tracker with streaks. Each account only ever sees its own data.

Built with Next.js (App Router), Prisma + Postgres (Neon), and Web Push.

## Local development

```bash
npm run dev
```

Requires `DATABASE_URL` set in both `.env` (Prisma CLI) and `.env.local` (Next.js). See `.env.example` for all required variables.

### On a Mac

Copy `.env` and `.env.local` into `~/Downloads` (or AirDrop them there), then run:

```bash
curl -fsSL https://raw.githubusercontent.com/Rockslide9959/day-app/main/scripts/setup-mac.sh | bash
```

It installs git and Node.js if they're missing, clones into `~/day-app`, installs packages and starts the dev server. Re-run it any time to pull the latest code and start again.

## Deploying

See [SETUP.md](./SETUP.md) for the full walkthrough: pushing to GitHub, deploying to Vercel, wiring up the background cron job, and installing on Android.
