# Savepoint Atlas

Static prototype of the Savepoint Atlas completion tracker: Landing, Checklist, Friends, Pro checkout, Account.

- Plain HTML, CSS and JS. No build step. Open `index.html`, or serve the folder (`python3 -m http.server`).
- Progress and settings are saved in the browser's localStorage. There are no accounts and no sync yet.
- Checkout goes to Stripe Payment Links and billing goes to the Stripe customer portal. Card details never touch this app. Set the links in `assets/common.js`; while they are `[BRACKETED]` placeholders, the buttons say payment isn't set up.
- Bracketed values such as `[PRICE]`, `[DATE]`, `[HANDLE]`, `[FRIEND LIMIT]`, `[TERMS-URL]` and `[PRIVACY-URL]` are placeholders to replace before launch.

Savepoint Atlas is an independent tool. It is not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.
