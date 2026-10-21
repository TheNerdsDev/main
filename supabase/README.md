# Contact form backend

The form on `/contact/` posts to a Supabase Edge Function, which saves each
enquiry to a database table and emails it to you through Resend. The email's
reply-to is the client, so answering is just hitting Reply. Sending from
our own domain (thenerds.dev), the client also gets a short thank-you
(`THANKS_NOTE` in the function); their reply to it comes to
getintouch@thenerds.dev.

```
form (src/core/ContactForm.js)
  → function `contact` (supabase/functions/contact/index.ts)
      → table `enquiries` (supabase/migrations/…_enquiries.sql)
      → email to you via Resend        ("Their Name via The Nerds")
      → thank-you to them via Resend   (only from our own domain)
```

The thank-you's wording is `THANKS_NOTE` in the function.

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

1. Sign up at <https://resend.com> (the account is under
   thenerds2k25@gmail.com), then create an **API key** with **Full access**.
   (A Sending-access key sends fine, but can't look up whether the
   thank-you was delivered or bounced, so fake addresses aren't caught —
   step 4b.)
2. Until a domain is verified, Resend sends **only to the address the account
   is under**, from `onboarding@resend.dev`, and there's no thank-you.
3. **Verify thenerds.dev:** Resend → **Domains** → **Add domain** →
   `thenerds.dev`. It lists a few DNS records (an MX and a TXT on
   `send.thenerds.dev`, a DKIM TXT on `resend._domainkey`). Add each one,
   exactly as shown, in the DNS settings where the domain was bought, then
   press **Verify** in Resend (it can take from minutes to a few hours).
   These sit on their own names (`send`, `resend._domainkey`), so they
   don't touch the mailbox's own records.
4. **getintouch@thenerds.dev has to receive mail** (a mailbox, or forwarding
   to Gmail, from your domain or email host): enquiries are sent there, and
   clients reply there.
5. Once verified, point the function at the domain (step 4 below):
   `CONTACT_FROM="The Nerds <getintouch@thenerds.dev>"` and
   `CONTACT_TO=getintouch@thenerds.dev`.

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
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx RATE_SALT=any-long-random-text
```

and, once thenerds.dev is verified in Resend:

```bash
npx supabase secrets set "CONTACT_FROM=The Nerds <getintouch@thenerds.dev>" CONTACT_TO=getintouch@thenerds.dev ALLOWED_ORIGINS=https://thenerds.dev,https://www.thenerds.dev,http://localhost:5173,http://localhost:5180
```

(`CONTACT_TO` can list several addresses, comma-separated. To stop the
thank-you without changing anything else: `CONTACT_THANKS=off`.)

Then deploy it. `--no-verify-jwt` lets the site call it without a key, and
the function guards itself instead (origin list, bot trap, rate limit):

```bash
npx supabase functions deploy contact --no-verify-jwt
```

Its URL is `https://YOUR-PROJECT-REF.supabase.co/functions/v1/contact`.

### 4b. Inbox for real enquiries, Spam for fake addresses

The thank-you goes to the visitor first; whether it's **delivered** or
**bounces** decides how the enquiry reaches you (usually 2–3 seconds later,
never more than about 12 — past that it's sent as a normal enquiry). This
needs the Resend key to have **Full access** (step 3); with a Sending-access
key every enquiry comes as a normal one, straight away.

- delivered (the address is real) → from **enquiries@thenerds.dev**
- bounced (no such address) → from **unverified@thenerds.dev**, subject
  starting `[Unverified]`, a warning at the top

Neither is `getintouch@` itself: mail claiming to be from your own address
but arriving from outside (Resend) is what your mail host's filter sends to
Spam, however real. No mailboxes needed for these two — they only send.

Once, in your mailbox (Hostinger Mail, or wherever `getintouch@` is read):

1. **Allow `enquiries@thenerds.dev`**: add it to the spam filter's allowed
   senders / allowlist (or your contacts), or open one of its emails in Spam
   and mark it **Not spam**. Real enquiries then land in the Inbox.
2. **Send `unverified@thenerds.dev` to Spam**: a filter / rule — "from
   unverified@thenerds.dev → move to Spam (Junk)" — or add it to the
   blocklist.

(Different addresses: `CONTACT_NOTIFY_FROM` / `CONTACT_UNVERIFIED_FROM`.)

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
- **An enquiry in Spam marked `[Unverified]`:** the address they gave
  bounced — it doesn't exist. (A real one there instead: allow
  `enquiries@thenerds.dev`, step 4b.)
- **Change the form's wording:** `contact.form` in `src/content/site.js`.
- **Add or rename a field:** it has to change in three places together: the
  form (`site.js`), the function (`FIELDS` in `index.ts`), and a new column
  on the table.
- **Spam limits:** `MIN_FILL_MS`, `LIMIT` and `WINDOW_MIN` at the top of the
  function. Testing it yourself: past 5 enquiries in 10 minutes from one
  connection, the form shows its error and nothing is sent.
