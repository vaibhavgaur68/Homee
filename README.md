# Homee — Daily Expenses PWA

A beautiful dark-themed daily expense tracker, installable as a native-like app on Android.

---

## Files in this package

```
homee/
├── index.html          ← Main app (updated with PWA support)
├── manifest.json       ← PWA manifest
├── sw.js               ← Service Worker (offline + notifications)
├── _headers            ← Cloudflare Pages headers (security + caching)
├── _redirects          ← Cloudflare Pages SPA routing
├── icons/
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png    ← Used for Android home screen icon
│   ├── icon-384.png
│   └── icon-512.png    ← Used for splash screen
└── README.md
```

---

## Deploy to Cloudflare Pages

1. Push all files to a GitHub repo (keep the folder structure as-is)
2. Go to **Cloudflare Dashboard → Pages → Create a project**
3. Connect your GitHub repo
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave blank)*
   - **Build output directory**: `/` *(or the folder name if in a subdirectory)*
5. Click **Save and Deploy**

Your app will be live at `https://your-project.pages.dev`

---

## Supabase Database Setup

Run these SQL statements in your **Supabase SQL Editor** (Database → SQL Editor → New Query):

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Categories table
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon_key text not null default 'other',
  color text not null default '#888888',
  created_at timestamptz default now()
);

-- Recurring rules table
create table if not exists recurring_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id uuid references categories(id) on delete cascade not null,
  amount numeric(10,2) not null,
  frequency text not null default 'daily',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Expenses table
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id uuid references categories(id) on delete set null,
  amount numeric(10,2) not null,
  note text default '',
  date date not null,
  source text not null default 'manual',  -- 'manual' | 'auto'
  status text not null default 'confirmed', -- 'confirmed' | 'skipped' | 'edited'
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  created_at timestamptz default now()
);

-- Row Level Security (RLS) — users can only see their own data
alter table categories enable row level security;
alter table recurring_rules enable row level security;
alter table expenses enable row level security;

-- Categories policies
create policy "Users manage own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recurring rules policies
create policy "Users manage own rules" on recurring_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Expenses policies
create policy "Users manage own expenses" on expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Performance indexes
create index if not exists idx_expenses_user_date on expenses(user_id, date desc);
create index if not exists idx_expenses_rule on expenses(recurring_rule_id, date);
create index if not exists idx_categories_user on categories(user_id);
create index if not exists idx_rules_user on recurring_rules(user_id) where is_active = true;
```

---

## Install on Android

1. Open your Cloudflare Pages URL in **Chrome for Android**
2. Log in to your account
3. After ~3 seconds, a banner will appear: **"Add Homee to Home Screen"** — tap **Install**
4. If the banner doesn't appear, tap Chrome's 3-dot menu → **Add to Home screen**
5. Homee will appear on your home screen like a native app (no browser bar, full screen)

---

## Features

### Offline Support
- Full app shell cached by service worker
- Google Fonts, Supabase JS SDK cached on first load
- Expense data cached in localStorage for instant display
- Toast notification when going offline/online
- Auto-sync when back online

### Notifications (Android Chrome)
- A prompt appears 5 seconds after login to enable reminders
- Daily reminder fires at **8:00 PM** if you have the app open or it's installed
- Reminder body adapts: tells you today's total if logged, or nudges you if not
- Notification tapping opens the app; "Add Expense" action opens the add sheet directly

### PWA Shortcuts (Android)
Long-press the Homee icon on your home screen to get quick shortcuts:
- **Add Expense** — opens straight to the add sheet
- **Today's Summary** — opens the main view

### Install Banner
Shows automatically after 3 seconds if Chrome detects the app is installable.
Dismissed state is remembered for 7 days.

---

## Configuration

The Supabase URL and key are already set in `index.html`. If you need to change them:

```js
// Near the top of the <script> block in index.html
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key-here';
```

To change the daily reminder time, edit `sw.js` and `index.html`:
```js
const REMINDER_HOUR = 20;   // 20 = 8 PM
const REMINDER_MINUTE = 0;
```

---

## Notes

- Notifications only work in **Chrome for Android** when the app is installed as a PWA or the tab is open
- Safari (iOS) supports PWA install but **not** push notifications (iOS limitation)
- The service worker caches assets on first load; subsequent visits work fully offline
- Supabase calls are never cached — they always try the network first, falling back to the local cache (localStorage) if offline
