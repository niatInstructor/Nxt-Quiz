# React Proficiency Exam Platform

A production-grade assessment platform built with **Next.js 16**, **Supabase**, and **Recharts** — designed for 300+ concurrent students.

## Features

- **Google OAuth** login for students via Supabase Auth
- **Admin password gate** for the admin portal
- **Per-section Exam IDs** — each section gets a unique code
- **50 MCQ questions** (25 theory + 25 coding "guess the output")
- **Randomized question order** per student (seeded PRNG)
- **Server-synced 40-minute timer** (prevents client manipulation)
- **Real-time waiting room** with auto-navigate on exam start
- **Bookmark, skip, and review** system with auto-save
- **Admin analytics dashboard** with Recharts visualizations
- **CSV export** for student results

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase (PostgreSQL + RLS) |
| Realtime | Supabase Realtime |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your Supabase and Google OAuth credentials
```

### 3. Set up Supabase
1. Run `supabase/react_quiz_schema.sql` in the SQL Editor
2. Run `supabase/add_server_time.sql` in the SQL Editor
3. Enable **Realtime** on `exams` and `exam_participants` tables
4. Configure **Google OAuth** in Auth > Providers > Google

### 4. Run locally
```bash
npm run dev
```

## Vercel Deployment

### Environment Variables
Add these in **Vercel > Settings > Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ADMIN_PASSWORD` | Admin portal password |

### Google OAuth Redirect
After deploying, add your Vercel domain to:
1. **Google Cloud Console** > Authorized redirect URIs: `https://your-project.supabase.co/auth/v1/callback`
2. **Google Cloud Console** > Authorized JavaScript origins: `https://your-vercel-domain.vercel.app`
3. **Supabase** > Auth > URL Configuration > Site URL: `https://your-vercel-domain.vercel.app`

## Usage

### Admin Flow
1. Go to `/admin/login` → enter admin password
2. Create exam → share the exam code with students
3. Monitor the waiting room → click **Start Exam**
4. Click **End Exam** to auto-submit all active attempts
5. View analytics and export CSV

### Student Flow
1. Go to `/login` → sign in with Google
2. Enter College ID on onboarding
3. Enter exam code → enter waiting room
4. Exam auto-starts when admin starts it
5. Answer questions → review → submit
