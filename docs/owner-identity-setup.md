# Verified owner access setup

This change uses the installed `@supabase/supabase-js` 2.91.0. No new package,
database table, ownership reassignment, or hosted setting is applied by the code.
Complete the following configuration in a separately authorized setup step.

## Authentication and email delivery

1. Enable Supabase Auth's Email provider and email signups for contractors who
   have existing email-keyed records but no Auth user. Anonymous sign-in is not
   accepted by the application. Confirmed email ownership is required.
2. Configure working SMTP delivery. Supabase's default sender is restricted and
   is not a production email-delivery setup. New Free projects may require custom
   SMTP before their email template can be customized.
3. Set the Magic Link email template to include a one-time code, for example:

   ```html
   <h2>Sign in to JobEstimate Pro</h2>
   <p>Enter this code in the account sign-in form: {{ .Token }}</p>
   <p>If you did not request this code, ignore this email.</p>
   ```

   The app calls `signInWithOtp` and `verifyOtp({ type: "email" })`. It does not
   consume an implicit token fragment, redirect parameter, or magic-link callback.
   Do not leave a link-only template configured for this code-entry flow.
4. Configure the Auth Site URL as the exact application origin. This implementation
   has no callback route or dynamic post-login redirect; no wildcard redirect
   allowlist is needed for it. Checkout returns to the fixed `/success` and
   `/cancel` paths under `NEXT_PUBLIC_SITE_URL`.
5. Provide `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the same project. An existing
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains a supported public-key fallback.
   Keep `SUPABASE_SERVICE_ROLE_KEY`, Stripe credentials, and AI keys server-only.
   Set `NEXT_PUBLIC_SITE_URL` to the exact HTTPS application origin in production.
   Never put a service-role/secret key in either public-key variable.

The SDK persists and refreshes its standard Auth session. Each protected request
sends its access token explicitly in an Authorization header; the server calls
`auth.getUser(token)` and requires a confirmed, non-anonymous authenticated user.
Cookie values, browser-stored email, decoded claims and user metadata do not grant
owner access. Owner responses are private/no-store. Keep HTTPS and a restrictive
same-origin hosting configuration; do not enable permissive credentialed CORS.

Sign-out clears this browser's SDK session and immediately invalidates workspace
requests. Other legitimate sessions remain valid. Standard Supabase access JWTs
may remain valid until expiry after sign-out; this batch does not add an
`auth.sessions` revocation lookup or change the project's token-lifetime policy.

## Existing records and local documents

Existing server records are looked up only by the email returned by the verified
Auth user, using the existing email-keyed schema. No historical row is reassigned.
An email change does not migrate another email's records; ownership recovery or
transfers require a separately reviewed process.

The device workspace uses a namespace bound to the verified Auth user ID. Old
unscoped local documents, settings and credentials are preserved untouched and
are not automatically imported based on an entered or saved email. They will not
appear in the signed-in workspace. This is a deliberate conservative boundary,
not a data deletion or an assertion of historical ownership. Existing legacy
owner-sync tokens no longer authorize any owner endpoint.

Only server-backed public approval links are supported. Customers can view and
approve the particular linked snapshot without owner sign-in. Device-only links
based on a local estimate ID are not server capabilities and no longer fall back
to reading or approving local browser history. A failed server share/approval
reports failure rather than silently writing a local approval.

## Private Data API permissions

Server authorization remains necessary because the privileged client bypasses
RLS. Also review and apply [the private-permissions script](../database/owner-access-permissions.sql)
to the existing application tables and quota RPC in a separately authorized
database change. The browser needs Supabase Auth, not direct Data API access to
account, proposal, signature, invoice, entitlement or cache tables.

The script enables RLS and revokes table access from PUBLIC, anon and authenticated;
it deliberately creates no direct-browser ownership policies because all such
access goes through verified server handlers. It explicitly grants only the
table operations used by those handlers to service_role, and restricts
`consume_free_generation` execution to service_role. Review any other consumers
before applying it. Missing optional tables are reported as notices; missing
quota RPC is an error so a partial setup is not mistaken for complete enforcement.

No new public tables are created. The October 30, 2026 Data API change still means
future tables need explicit grants; do not fix permission errors with blanket
anon/authenticated grants or grants on all tables. Any future app-owned tables
must include minimum service-role grants and appropriate RLS in their own review.

This repository does not contain the hosted quota function or table DDL. Verify
its implementation and audit other exposed functions/role inheritance before
relying on hosted database enforcement. No Supabase CLI, PostgreSQL server/client,
or Docker runtime was available for isolated grants/RLS execution in this task.
The SQL and hosted Auth/email settings remain unapplied.

## References checked for this implementation

- [Passwordless email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Server-confirmed getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Sessions and sign-out semantics](https://supabase.com/docs/guides/auth/sessions)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [October 30 explicit-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
