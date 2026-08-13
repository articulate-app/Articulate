# Google OAuth verification — reply pack

Google Cloud project: `657483253469` / `articulate-82bdc`
App: https://app.whyarticulate.com

## 1. Requested scopes (exact list)

Source of truth: `GOOGLE_OAUTH_SCOPES` in `app/lib/google-oauth.ts`.

| Requested value | Scope recorded by Google | Why we need it |
| --- | --- | --- |
| `openid` | `openid` | Sign-in identifier for the Google account being linked |
| `email` | `https://www.googleapis.com/auth/userinfo.email` | Show which Google account is connected to a project |
| `profile` | `https://www.googleapis.com/auth/userinfo.profile` | Basic profile for the connected-account label |
| `https://www.googleapis.com/auth/webmasters.readonly` | same | List the user's Search Console properties and read search performance |
| `https://www.googleapis.com/auth/analytics.readonly` | same | List GA4 properties and read GA4 report data for the selected property |

No write scopes are requested. This is a read-only, least-privilege integration.

## 2. Google API calls made with the user's token

| Scope | API call | Code |
| --- | --- | --- |
| `analytics.readonly` | `GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries` | `listGoogleAnalyticsProperties` in `app/lib/google-oauth.ts` |
| `analytics.readonly` | `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` | `fetchGoogleAnalyticsDailyReport` in `app/lib/google-analytics-data.ts`, called by `app/api/auth/google/analytics-sync/route.ts` |
| `webmasters.readonly` | `GET https://www.googleapis.com/webmasters/v3/sites` | `listGoogleSearchConsoleSites` in `app/lib/google-oauth.ts` |
| `webmasters.readonly` | `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` | `sync-search-console` edge function (property/query/page daily sync) |
| `webmasters.readonly` | `GET https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps` | `sync-search-console` edge function (read-only sitemap status) |
| `webmasters.readonly` | `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` | `sync-search-console` edge function (monitored-page URL Inspection queue) |
| `email` / `profile` | `GET https://www.googleapis.com/oauth2/v2/userinfo` | `fetchGoogleAccountEmail` in `app/lib/google-oauth.ts` |

## 3. Test credentials

| Field | Value |
| --- | --- |
| App URL | https://app.whyarticulate.com |
| Email | `google-oauth-review@whyarticulate.com` |
| Password | `ArticulateGSC-Review-1h70zho6Aa1!` |

Verified working (password grant returns HTTP 200; account is email-confirmed and not banned).
No phone verification, no credit card, no payment step, no email confirmation required.

Hidden demo route (not linked from navigation): https://app.whyarticulate.com/integrations/google-oauth-demo

## 4. Email draft to Google (English)

> Subject: Re: OAuth verification — Articulate (project 657483253469 / articulate-82bdc)
>
> Hi,
>
> Thank you for the review. Below are the two demo videos, test credentials and step-by-step navigation you requested.
>
> **Demo videos**
> - Video 1 — OAuth consent screen with all requested scopes expanded (first-time grant): https://youtu.be/x5zbQmBfYNE
> - Video 2 — In-app functionality for every requested scope: `<VIDEO_2_LINK>`
>
> **Note on Video 1** — This is a genuine first-time authorisation: the granular-consent checkboxes start unchecked, and both are then expanded via "See access details" before "Select all" is used. The two permissions shown are exactly the two sensitive scopes we request, both read-only: "See and download your Google Analytics data" (`https://www.googleapis.com/auth/analytics.readonly`) and "View Search Console data for your verified sites" (`https://www.googleapis.com/auth/webmasters.readonly`). The Google consent and permission screens render in English; only the initial Google account-chooser step appears in Portuguese, because the language of the Google account used for the recording is set to Portuguese (Portugal). For the reviewer's convenience: "Iniciar sessão com o Google" = "Sign in with Google", "Selecione uma conta" = "Choose an account", "Continuar para Articulate" = "Continue to Articulate".
>
> Video 1 timestamps: 0:00 requested scopes listed in-app · 0:05 redirect to `accounts.google.com` with our `client_id` visible in the address bar · 0:10 "Google hasn't verified this app" → Advanced → "Go to Articulate (unsafe)" · 0:14 `openid`/`email`/`profile` consent (name, profile picture, email address) · 0:18 permissions screen with both checkboxes unchecked · 0:22 Analytics permission expanded · 0:30 Search Console permission expanded · 0:34 Select all → Continue · 0:42 redirect back to Articulate · 0:46 "Connected as …" plus the live Search Console property list · 0:55 the live GA4 property list · 1:06 GA4 `runReport` result · 1:10 Disconnect.
>
> **Test credentials (no phone number, no credit card, no payment required)**
> - App URL: https://app.whyarticulate.com
> - Email: google-oauth-review@whyarticulate.com
> - Password: ArticulateGSC-Review-1h70zho6Aa1!
>
> **Step-by-step navigation**
> 1. Open https://app.whyarticulate.com and sign in with the credentials above (email + password form, no other verification step).
> 2. Open the OAuth demo page directly: https://app.whyarticulate.com/integrations/google-oauth-demo (this page is not linked from the product navigation; it exists so reviewers can reach the Google connection flow in one step). Alternatively, the same panel is available in the product at Projects → any project → Analytics tab → "Google Analytics connection".
> 3. Select any project from the dropdown.
> 4. Click **Connect Google**. You will be redirected to the Google consent screen showing all requested scopes. (Until verification completes, Google shows the "unverified app" interstitial — please choose Advanced → Continue.)
> 5. Sign in with a Google account that has access to at least one Search Console property and one Google Analytics 4 property, and grant the requested permissions.
> 6. You are returned to Articulate. Click **Choose properties**. The dropdowns are populated live from Google using the token you just granted:
>    - "Search Console property" is populated by `webmasters/v3/sites` (`webmasters.readonly`).
>    - "Google Analytics 4 property" is populated by Analytics Admin `accountSummaries` (`analytics.readonly`).
> 7. Select one Search Console property and one Google Analytics 4 property, then click **Save properties**.
> 8. Articulate immediately calls the Google Analytics Data API (`properties/{id}:runReport`) with your token and displays the result: the GA4 property ID, the connected Google account, the number of daily rows returned, the date range, total sessions, total active users and the channel groups. You can re-run this at any time with the **Sync Analytics data** button.
> 9. Open Projects → the same project → **Analytics** tab to see the Google Analytics data rendered as time-series charts and channel breakdowns. The Search Console property selected in step 7 is used the same way for search performance data.
> 10. Click **Disconnect** to revoke the stored refresh token and remove the connection.
>
> **How each scope is used**
> - `openid`, `email`, `profile` — identify and display which Google account is connected to a project (for example "Connected as name@example.com").
> - `https://www.googleapis.com/auth/webmasters.readonly` — list the user's Search Console properties so they can pick one, and read search performance data for the selected property.
> - `https://www.googleapis.com/auth/analytics.readonly` — list the user's GA4 properties so they can pick one, and read GA4 report data (sessions, active users, average session duration by date and default channel group) for the selected property.
>
> Articulate requests read-only scopes only. We request no write, delete or management scopes, and we do not request Gmail, Drive, Calendar or Contacts access. Data is used solely to display SEO and traffic reporting to the user who connected the account, and access is revoked immediately when the user clicks Disconnect.
>
> Please let me know if you need anything else.
>
> Best regards,
> Ivo Relvas
> Articulate

## 5. Video 1 — OAuth consent screen — RECORDED

Uploaded (unlisted): https://youtu.be/x5zbQmBfYNE — "articulate - first time connection", 1:12.

- [x] Address bar visible for the whole recording; "Requested scopes" box on the demo page shows all five scopes.
- [x] Project selected, **Connect Google** clicked; address bar shows `accounts.google.com/.../accountchooser?access_type=offline&client_id=657483253469-...`.
- [x] Account chooser (rendered in Portuguese — the recording account's language) and account selection.
- [x] "Google hasn't verified this app" → **Advanced** → **Go to Articulate (unsafe)**.
- [x] `openid`/`email`/`profile` consent step ("Google will allow Articulate to access this info about you": name, profile picture, email address).
- [x] Permissions screen as a **genuine first-time grant** — both granular checkboxes start unchecked, no "already has access" banner.
- [x] Both permissions expanded via **See access details**: Analytics ("See your reporting data, including all dimensions and metrics…") and Search Console ("View Search Console data without making any changes (e.g., list sites, view crawl errors)").
- [x] **Select all** → **Continue**.
- [x] Redirect back to `app.whyarticulate.com/integrations/google-oauth-demo?google_connect=1&project_id=90` and "Connected as irelvas@whyarticulate.com".
- [x] Bonus beyond the shot list: live Search Console property list, live GA4 property list, **Save properties** → GA4 `runReport` result panel (577 daily rows, 2026-05-08 → 2026-08-05, 5,274 sessions, 4,266 active users, channel groups), and **Disconnect**.

Known limits: the recording has no narration or captions, and the `scope` query parameter is truncated in the address bar (the scopes are instead legible in the in-app "Requested scopes" box and on the consent screen itself).

Superseded: `articulate-oauth-consent-scopes.mov` (the earlier 1:07 Portuguese take) showed "A app Articulate já tem algum acesso" — a re-consent, not a first-time grant. Do not send that one.

## 6. Video 2 — In-app functionality (target 2–4 min)

- [ ] Sign in at `https://app.whyarticulate.com` with `google-oauth-review@whyarticulate.com` (show the login form and the successful landing page).
- [ ] Go to Projects → open a project → **Analytics** tab → "Google Analytics connection" card. (Or use `/integrations/google-oauth-demo`; show one of the two, and mention the other.)
- [ ] Click **Connect Google** and complete consent (can be sped up; it is covered in detail in Video 1).
- [ ] Back in the app, show **Connected as <google account>** — this is the `email`/`profile` scope in use.
- [ ] Click **Choose properties**. Open the **Search Console property** dropdown and pause on the list — say out loud/caption that this list comes from `webmasters/v3/sites` using `webmasters.readonly`.
- [ ] Open the **Google Analytics 4 property** dropdown and pause on the list — caption that it comes from Analytics Admin `accountSummaries` using `analytics.readonly`.
- [ ] Select one property in each dropdown and click **Save properties**.
- [ ] Pause on the green result panel: GA4 property ID, connected account, number of daily rows, date range, total sessions, total active users, channel groups. Caption: "Google Analytics Data API runReport, called with the user's OAuth token".
- [ ] Click **Sync Analytics data** once more to show the call happening live.
- [ ] Scroll to the Analytics tab charts and show sessions/users over time and the channel breakdown populated from that GA4 property.
- [ ] Show the Search Console area of the Analytics tab with the connected property's data (`webmasters.readonly` in use).
- [ ] Click **Disconnect** and show the connection returning to the not-connected state (token revoked/removed).
- [ ] Optional closing frame: text overlay listing the five requested scopes and "read-only".

## 7. Search Console overview configuration

After deploying migration `20260806120000_project_search_console_overview.sql` and the `sync-search-console` edge function:

1. Ensure `GA_CLIENT_ID` / `GA_CLIENT_SECRET` (or `GSC_*`) are set for OAuth refresh.
2. Deploy edge function `sync-search-console` with the same secrets as competitive content sync.
3. Optional cron: call `POST /functions/v1/sync-search-console` with header `x-search-console-sync-secret` (or `x-competitive-content-sync-secret`) and body `{ "project_id": <id>, "job_type": "all", "trigger": "automatic" }`.
4. In the project sheet: **Google integrations** → connect account → select Search Console property → backfill starts automatically.
5. Overview shows **Organic search**; detailed views live under **SEO & search**.
6. URL Inspection uses monitored `project_site_pages` only — never claim full-site indexed totals.

## 8. Deployment note

The Analytics-via-user-token path is new code in this repo:

- `app/lib/google-analytics-data.ts`
- `app/api/auth/google/analytics-sync/route.ts`
- `app/lib/services/project-google-oauth.ts` (`syncProjectGoogleAnalytics`)
- `app/components/projects/google-connect-panel.tsx`
- `app/components/projects/ProjectAnalyticsSettings.tsx`
- `app/integrations/google-oauth-demo/page.tsx`

It must be deployed to `app.whyarticulate.com` **before** recording Video 2. `GA_CLIENT_ID` and `GA_CLIENT_SECRET` are already set in Vercel Production, so no new environment variables are needed. `NEXT_PUBLIC_GOOGLE_OAUTH_CONNECT_ENABLED` is unset in Production, which means the Connect Google panel is visible in the main Analytics tab (the flag only hides it when explicitly set to `false`).
