# Contact form backend

The form on `/contact/` posts to a Supabase Edge Function, which saves each
enquiry to a database table and emails it to you through Resend. The email's
reply-to is the client, so answering is just hitting Reply.

```
form (src/core/ContactForm.js)
  → function `contact` (supabase/functions/contact/index.ts)
      → table `enquiries` (supabase/migrations/…_enquiries.sql)
      → email to you via Resend
```

Both services have free tiers that comfortably cover a portfolio's enquiries.

## One-time setup

### 1. Supabase project

1. Sign up at <https://supabase.com> and create a project (any name, a strong
   database password, the region nearest you).
2. Note its **project ref**: the `xxxxxxxx` in the dashboard's URL and in
   `https://xxxxxxxx.supabase.co`.

### 2. The table

Dashboard → **SQL Editor** → New query → paste the whole of
`supabase/migrations/20261011120000_enquiries.sql` → **Run**.

The table has row level security on and no policies, so the public key can't
read or write it. Only the function can.

### 3. Resend (the email)

1. Sign up at <https://resend.com> and create an **API key** (Sending access).
2. Until you verify a domain, Resend sends **only to the address you signed up
   with**, from `onboarding@resend.dev`. That's enough to start, so set
   `CONTACT_TO` to that address.
3. To send to both of you, or from your own address (e.g.
   `hello@thenerds.studio`): Resend → Domains → add your domain → add the DNS
   records it shows → then set `CONTACT_FROM` (e.g. `The Nerds <hello@thenerds.studio>`)
   and list both inboxes in `CONTACT_TO`.

### 4. Deploy the function

From the project's `main` folder (it runs the Supabase CLI through npx, so
nothing to install globally):

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR-PROJECT-REF
```

(`init` only adds `supabase/config.toml`. Answer "n" to the VS Code questions.)

Set its settings. Use your own key and address, and the sites allowed to post
to it: your local dev servers now, your real domain once it's live:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx CONTACT_TO=you@example.com ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5180 RATE_SALT=any-long-random-text
```

Then deploy it. `--no-verify-jwt` lets the site call it without a key, and
the function guards itself instead (origin list, bot trap, rate limit):

```bash
npx supabase functions deploy contact --no-verify-jwt
```

Its URL is `https://YOUR-PROJECT-REF.supabase.co/functions/v1/contact`.

### 5. Point the site at it

Copy `.env.example` to `.env` and put that URL in `VITE_CONTACT_ENDPOINT`.
Restart `npm run dev`.

When the site goes live, set the same `VITE_CONTACT_ENDPOINT` in your host's
environment settings (Netlify / Vercel / Cloudflare Pages). Then add the live
domain to `ALLOWED_ORIGINS` and run the `secrets set` command again.

## Day to day

- **Read enquiries:** Supabase dashboard → Table Editor → `enquiries`.
  `emailed = false` means it saved but the email didn't go out. Check the
  function's logs (Edge Functions → contact → Logs).
- **Change the form's wording:** `contact.form` in `src/content/site.js`.
- **Add or rename a field:** it has to change in three places together: the
  form (`site.js`), the function (`FIELDS` in `index.ts`), and a new column
  on the table.
- **Spam limits:** `MIN_FILL_MS`, `LIMIT` and `WINDOW_MIN` at the top of the
  function.
