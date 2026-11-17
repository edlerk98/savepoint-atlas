# Sogilex

Sogilex, the completion tracker for open-world games: landing, checklist, friends, contributions with review, Pack Plus checkout, account. Static site on GitHub Pages with Supabase for accounts.

- Plain HTML, CSS and JS. No build step. Open `index.html`, or serve the folder (`python3 -m http.server`).
- Signed out, progress and settings are saved in the browser's localStorage. Signed in (magic-link email via Supabase), they sync to the account. On first sign-in, the browser's list moves into the account.
- Pricing: Free, plus Pack Plus for Grand Theft Auto VI at $9.99 one-time (coming soon). Checkout sends signed-in users to a Stripe Payment Link with their account id as `client_reference_id`. Card details never touch this app. Set `paymentLinkPackPlus` in `assets/common.js`; while it is a `[BRACKETED]` placeholder, checkout says Plus isn't on sale yet.
- Accounts are off until `supabaseUrl` and `supabaseAnonKey` are set in `assets/common.js`. The site works without them.
- Bracketed values such as `[PRICE]`, `[DATE]`, `[HANDLE]`, `[FRIEND LIMIT]`, `[TERMS-URL]` and `[PRIVACY-URL]` are placeholders to replace before launch.

Sogilex is an independent tool. It is not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.

## Turning on accounts (Supabase)

1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql`. It creates `profiles` and `checklist_items` with row-level security (each user can only touch their own rows) and a `delete_my_account()` function.
3. Authentication > URL Configuration: set Site URL to `https://edlerk98.github.io/savepoint-atlas/` and add `https://edlerk98.github.io/savepoint-atlas/**` to Redirect URLs.
4. Copy the Project URL and the anon public key into `assets/common.js`. Never use the `service_role` key in this site.
5. Before real users: set up custom SMTP under Authentication > Emails. Supabase's built-in sender is rate-limited and meant for testing.

### Contributions and friends (`supabase/002_contributions_friends.sql`)

Run it in the SQL Editor after `schema.sql`. It adds:

- `pack_entries`: player submissions with a required source. Approved entries are public and flow into everyone's checklist; pending and rejected ones are visible only to the submitter and reviewers.
- `admins`: who may review. Add yourself once, replacing the email:
  `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`
- `friendships` plus functions to send, accept and list requests, and `friend_progress()`, which returns completion counts on verified entries only (never item titles or notes).

Pages: `contribute.html` (submit, see your submissions), `review.html` (reviewers only; the database enforces it), `privacy.html` (draft: fill in the bracketed details and have it reviewed).

Sign-in email: paste `supabase/email-sign-in.html` into Authentication > Emails > Templates (both "Magic link" and "Confirm signup").

Fonts are self-hosted in `assets/fonts` (Latin subsets from Fontsource 5.3.0, SIL Open Font License).

The Supabase client is vendored at `assets/vendor/supabase.js` (supabase-js 2.118.0, MIT).
