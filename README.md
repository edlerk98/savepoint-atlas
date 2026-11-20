# Savepoint Atlas (closed)

Savepoint Atlas, a completion tracker for open-world games, was shut down on 2026-11-20. It was an early test
and is unrelated to Sogilex's current tools. atlas.sogilex.com now shows a short "closed" page; the old pages
redirect to it. Its database tables were removed (see `sogilex-build/supabase/015_remove_atlas.sql`), and the
shared sign-in email template moved to `sogilex-build/supabase/email-sign-in.html`. The full app is in this
repository's history if it is ever needed.
