# Day

A personal life-management PWA: reminders with real push notifications, a daily schedule, a daily to-do list, and configurable routines. No accounts — just a passcode gate.

Built with Next.js (App Router), Prisma + Postgres (Neon), and Web Push.

## Local development

```bash
npm run dev
```

Requires `DATABASE_URL` set in both `.env` (Prisma CLI) and `.env.local` (Next.js). See `.env.example` for all required variables.

## Deploying

See [SETUP.md](./SETUP.md) for the full walkthrough: pushing to GitHub, deploying to Vercel, wiring up the reminder-check cron job, and installing on Android.
