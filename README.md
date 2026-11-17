# Savepoint Atlas

Static prototype of the Savepoint Atlas completion tracker: Landing, Checklist, Friends, Pro checkout, Account.

- Plain HTML, CSS and JS. No build step. Open `index.html`, or serve the folder (`python3 -m http.server`).
- Signed out, progress and settings are saved in the browser's localStorage. Signed in (magic-link email via Supabase), they sync to the account. On first sign-in, the browser's list moves into the account.
- Checkout goes to Stripe Payment Links and billing goes to the Stripe customer portal. Card details never touch this app. Set the links in `assets/common.js`; while they are `[BRACKETED]` placeholders, the buttons say payment isn't set up.
- Accounts are off until `supabaseUrl` and `supabaseAnonKey` are set in `assets/common.js`. The site works without them.
- Bracketed values such as `[PRICE]`, `[DATE]`, `[HANDLE]`, `[FRIEND LIMIT]`, `[TERMS-URL]` and `[PRIVACY-URL]` are placeholders to replace before launch.

Savepoint Atlas is an independent tool. It is not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.

## Turning on accounts (Supabase)

1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql`. It creates `profiles` and `checklist_items` with row-level security (each user can only touch their own rows) and a `delete_my_account()` function.
3. Authentication > URL Configuration: set Site URL to `https://edlerk98.github.io/savepoint-atlas/` and add `https://edlerk98.github.io/savepoint-atlas/**` to Redirect URLs.
4. Copy the Project URL and the anon public key into `assets/common.js`. Never use the `service_role` key in this site.
5. Before real users: set up custom SMTP under Authentication > Emails. Supabase's built-in sender is rate-limited and meant for testing.

The Supabase client is vendored at `assets/vendor/supabase.js` (supabase-js 2.45.4, MIT).
