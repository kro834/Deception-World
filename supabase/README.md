# Shared gallery

The shared gallery uses its own Supabase Auth, Postgres tables and private
Storage bucket. The application's existing Grok authentication and `migrations/`
remain separate. Static gallery images remain available before this service is
configured; shared writes fail closed.

Provision a Supabase project and apply
`migrations/202610060001_shared_gallery.sql` to that project's database with an
administrator connection or its SQL editor. Set these server environment values
in Vercel:

- `SUPABASE_URL`: the HTTPS project URL.
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`: the browser publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`: a server-only service key.

Only the project URL and publishable key are returned by `/api/gallery/config`.
The service key must never use a `VITE_` prefix. A service JWT in the public-key
variable makes the gallery fail closed. `/api/gallery/config` returns
`ready: false` until both credentials and the gallery table are available.

Enable anonymous sign-ins in Supabase Auth. The browser creates an anonymous
session only on the visitor's first intentional write; viewing the gallery does
not create an account. This flow has no visible login or email dependency. Keep
Supabase's signup/IP rate limits enabled. Clearing browser storage can lose that
session and its permission to remove or restore earlier posts.

All verified Supabase sessions, including anonymous sessions, can update every static and posted
image title. Each update supplies the last seen version; a concurrent change
returns HTTP 409 and the latest title/version. The database keeps the previous
and new title plus the editor and timestamp. History retains at most the latest
20,000 changes. Entries older than thirty days expire in batches of at most 500
on later writes, so cleanup can take several writes after an inactive period.
Current titles persist independently of this recovery history. Only the session
that owns a post can remove or restore it. Removal hides the post without
deleting the image; previously issued private signed URLs expire within one
hour. Up to 1000 signed URLs are cached per server process for fifteen minutes,
so shared-title polling can reuse image URLs.

Uploads accept one JPEG, PNG or WebP file up to 10 MiB and 40 million pixels.
The server rejects animation, re-encodes to WebP, strips original metadata,
limits the longest edge to 2400 pixels and stores at most 3 MiB. Each account
gets ten upload attempts per UTC day, fifty stored posts and 100 MiB. The gallery
allows one hundred upload attempts per UTC day across all sessions and
holds at most 1000 stored posts and 500 MiB. Deleted and pending images count
toward storage quotas. Title updates are limited to twenty per session and one
hundred twenty across the gallery per UTC hour; deletes and restores each allow
thirty per session per UTC hour. All limits live in database
transactions, so multiple server instances cannot independently exceed them.
Each mutation also removes at most 128 obsolete rate counters older than seven
days using an indexed query that skips locked rows. This bounds cleanup work and
prevents lifetime accumulation without requiring a scheduled job.

An interrupted upload can retain an invisible `pending` reservation. Review
pending rows against `storage.objects` before removing any orphan manually; do
not drop their reservation while an uploaded object remains. Quota reservations
are deliberately conservative when an upstream storage response is uncertain.
The HTTP handler removes a failed upload and cancels its reservation only when
Storage confirms removal. The feature never automatically purges user images.

Run `node --test scripts/gallery-server.test.mjs` to verify the schema, grants,
version history, ownership, quotas and request validation with an isolated
Postgres-compatible database. These tests do not establish live Supabase/Vercel
provisioning; verify anonymous session creation and the shared flow after configuration.
