# Shared gallery

The shared gallery uses its own Supabase Auth, Postgres tables and private
Storage bucket. The application's existing Grok authentication and `migrations/`
remain separate. Static gallery images remain available before this service is
configured; shared writes fail closed.

Provision a Supabase project and apply
`migrations/202610060001_shared_gallery.sql` followed by
`migrations/202610060002_gallery_catalogue_113.sql`,
`migrations/202610070001_gallery_lossless_uploads.sql` and
`migrations/202610070002_gallery_title_editing.sql` to that project's database
with an administrator connection or its SQL editor. Existing installations apply
only the migrations they have not already applied, in that order. The second replaces
the `gallery_titles_artwork_id_check` constraint and title RPC's static-ID
validation atomically without modifying existing titles, posts, history, quotas
or privileges; `g01` through `g113` retain their original IDs. Inspect the live
constraint name and definition before applying this migration. Its precondition
accepts only the validated original or already-expanded static/community ID
domain; an absent, unvalidated or unexpected same-named check fails the
transaction before changing the constraint or title RPC.
Set these server environment values in Vercel:

- `SUPABASE_URL`: the HTTPS project URL.
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`: the browser publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`: a server-only service key.

Only the project URL and publishable key are returned by `/api/gallery/config`.
The service key must never use a `VITE_` prefix. A service JWT in the public-key
variable makes the gallery fail closed. `/api/gallery/config` returns
`ready: false` until credentials, the gallery schema and the two private 19 MiB
buckets are available. A ready response includes `uploadProtocol: 2` and
`maxFileBytes: 19922944`. Apply the third migration before publishing the new
client: there is no fallback to the old lossy protocol.

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

Uploads accept one JPEG, PNG or WebP file up to 19 MiB and 40 million pixels.
The server rejects animation, multi-picture/gain-map JPEGs and malformed containers,
and validates the complete decoded image. It strips EXIF (except orientation),
GPS, XMP, text comments and embedded thumbnails, while preserving dimensions,
color interpretation, alpha and the original
compressed image samples. PNG compression is lossless; JPEG/WebP are not lossy
re-encoded. ICC color profiles are retained intact to preserve appearance; their
own descriptions, copyright and private tags can contain information. This is
not a guarantee of removing every form of embedded data or information visible
in the pixels. Container profile names and padding are normalized. A file which
cannot be made smaller is still accepted within the
limit; no size reduction is promised for already efficient files. Each account
gets ten upload attempts per UTC day, fifty stored posts and 100 MiB. The gallery
allows one hundred upload attempts per UTC day across all sessions and
holds at most 1000 stored posts and 500 MiB including temporary reservations.
Deleted and pending images count toward storage quotas. Title updates allow a
burst of twenty per session, replenishing one edit every three seconds, and a
shared burst of one hundred twenty, replenishing two edits per second. A title
throttle returns HTTP 429 with `Retry-After` and JSON `retryAfterSeconds`; there
is no one-hour title lockout after the fourth migration. Identical saved-title
retries return the current version without spending capacity or adding history,
even if their original expected version is stale. Different stale changes still
return 409 with the latest title and version. Deletes and restores each allow
thirty per session per UTC hour. All limits live in database
transactions, so multiple server instances cannot independently exceed them.
Each mutation also removes at most 128 obsolete rate counters older than seven
days using an indexed query that skips locked rows. This bounds cleanup work and
prevents lifetime accumulation without requiring a scheduled job.

The upload flow bypasses Vercel's 4.5 MB incoming function-body limit. The browser
sends only `{size,type}` JSON to `POST /api/gallery/upload`, uploads the original
directly to the private `gallery-upload-staging` bucket using the returned
`{uploadId,path,token}` and Supabase `uploadToSignedUrl` with `upsert:false`, then
sends `{uploadId}` to `POST /api/gallery/upload/complete`. Both API calls verify
the Supabase user and same-origin request. Neither accepts a client-selected
storage path or URL. The small-file multipart route remains available but uses
the same lossless sanitizer. There are no browser-role bucket write policies.

Every signed-upload intent reserves the full 19 MiB regardless of the declared
size, with at most ten active intents per user and one hundred globally. The
same database advisory lock includes staging and final objects in the 500 MiB
cap; final images additionally retain the fifty-post / 100 MiB user cap. During
finalization both objects count, so free space must accommodate the temporary
overlap. A signed upload token lasts two hours. Its object and quota reservation
remain for at least 135 minutes, even after success or validation failure, to
prevent a still-valid token recreating an object after cleanup.

Initialization lazily claims up to four expired staging paths for removal, then
releases their reservations only after Storage confirms removal. A three-minute
cleanup lease makes interrupted cleanup retryable. No cron or background job is
required, but an idle gallery retains expired staging objects until another
initialization. A failed cleanup does not bypass the storage cap. Finalization
also uses a three-minute fenced lease, allows at most five processing attempts
per intent (ready responses remain idempotent), and binds an immutable final path to its
SHA-256 digest before writing. An old worker can neither overwrite nor delete a
new worker's object, and repeated completion returns the same ready post.

An interrupted final write can retain an invisible `pending` post reservation;
this is deliberately not automatically deleted because an older worker may
still finish an already-authorized immutable upload. Review pending rows,
`gallery_uploads` and `storage.objects` together before manual recovery. Never
drop a final reservation while a final object remains or a worker can still
write; never remove a staging tombstone before its token expires. The feature
never automatically purges posted images. Neither a lost upstream reply nor a
lease timeout is evidence that an object was not saved.

Run `node --test scripts/gallery-server.test.mjs scripts/gallery-title-editing.test.mjs` to verify the schema, grants,
version history, ownership, quotas and request validation with an isolated
Postgres-compatible database. These tests do not establish live Supabase/Vercel
provisioning; verify anonymous session creation and the shared flow after configuration.
