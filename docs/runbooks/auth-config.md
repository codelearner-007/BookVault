# Auth configuration runbook (production parity)

`supabase/config.toml` configures only the **local** stack. Its auth values come from
`supabase/.env` through `env()` (template: `supabase/.env.example`). The hosted Supabase
project must carry the same values. Apply this checklist before the first hosted deploy and
on every release that changes an auth setting (build plan B0.7, H1).

## Why GoTrue itself must be configured

The anon key is public. Anyone can call `/auth/v1/signup`, `/token`, `/recover`, `/verify`
and `PUT /user` without going through the Next.js routes. The Next.js limits, generic
answers and breach pre-check are a second layer. The controls that matter also have to be
set inside Supabase Auth.

## Local stack

1. `cp supabase/.env.example supabase/.env` (once). Edit values there, never in `config.toml`.
2. Apply a change with `supabase stop` then `supabase start`. Plain `stop` keeps the data
   volume. Never use `--no-backup` or `db reset` for a config change.
3. Check what GoTrue received: `docker exec supabase_auth_BookVault env | grep GOTRUE_`.
   `backend/tests/auth/test_gotrue_direct.py::test_gotrue_config_matches_env` checks the
   main values.
4. Mail goes to the local mail catcher (Mailpit, `[local_smtp]`): UI at
   http://127.0.0.1:55344, API at `/api/v1/messages`.

Known local limits of the CLI (3.0.0, GoTrue v2.197), found while building B0.7:

| Control | Local | Hosted |
|---|---|---|
| Leaked-password (HIBP) check inside GoTrue | No config key; not available | Turn on "Leaked password protection" (`password_hibp_enabled`) |
| GoTrue per-IP rate limits (`token_refresh`, `token_verifications`, `sign_in_sign_ups`) | Inactive: GoTrue applies them only when `GOTRUE_RATE_LIMIT_HEADER` is set, and the CLI cannot set it | Active (the platform sets the header) |
| `email_sent` per hour | The CLI overrides it (360000) while Mailpit is used | The configured value |
| Per-email resend gap (`max_frequency`) | Active | Active |

So locally the per-IP limits come only from the Next.js routes. The breach check comes only
from the Next.js pre-check, when `PASSWORD_BREACH_CHECK=hibp` (default `off` for offline
development, D-24).

## Hosted checklist

Open the hosted project's dashboard (Authentication settings), or push with
`supabase config push` (CLI 3.0.0 has it; it maps `config.toml` auth keys to the Management
API, but the HIBP switch has no `config.toml` key and must be set in the dashboard). Set each
row to the value in the production env, then run the parity check below.

| Setting | Value (production env) | Source |
|---|---|---|
| Site URL | `AUTH_SITE_URL` (the public https origin) | `[auth] site_url` |
| Redirect allow-list | `https://<site>/api/auth/callback**` only | `additional_redirect_urls` |
| JWT expiry | `AUTH_JWT_EXPIRY_SECONDS` (3600) | `jwt_expiry` |
| Refresh token rotation | on, reuse interval `AUTH_REFRESH_TOKEN_REUSE_INTERVAL_SECONDS` (10) | `[auth]` |
| Minimum password length | `AUTH_PASSWORD_MIN_LENGTH` (12, D-26) | `minimum_password_length` |
| Password requirements | none (D-26) | `password_requirements = ""` |
| Leaked password protection | on (D-24) | dashboard only |
| Confirm email | on | `[auth.email] enable_confirmations` |
| Phone confirmations | on, even with SMS off: GoTrue reveals existing emails on signup while SMS autoconfirm is on (AC-37) | `[auth.sms] enable_confirmations` |
| Secure email change (double confirm) | on | `double_confirm_changes` |
| Secure password change | on | `secure_password_change` |
| Email OTP / link expiry | `AUTH_EMAIL_OTP_EXPIRY_SECONDS` (3600) | `otp_expiry` |
| Email resend gap | `AUTH_EMAIL_MAX_FREQUENCY` (1m) | `max_frequency` |
| Session timebox / inactivity | `AUTH_SESSION_TIMEBOX` (24h) / `AUTH_SESSION_INACTIVITY_TIMEOUT` (8h) | `[auth.sessions]` |
| Rate limits | `AUTH_RATE_LIMIT_EMAIL_SENT`, `_TOKEN_REFRESH`, `_SIGN_IN_SIGN_UPS`, `_TOKEN_VERIFICATIONS` | `[auth.rate_limit]` |
| SMTP | `AUTH_SMTP_*` of the real provider; `[auth.email.smtp] enabled = true` | `[auth.email.smtp]` |
| MFA | TOTP enroll + verify on; phone and WebAuthn off | `[auth.mfa]` |
| Custom access token hook | `public.custom_access_token_hook` | `[auth.hook.custom_access_token]` |
| Password verification hook | `public.password_verification_attempt_hook` (audits failed and banned sign-ins; needs a plan with this hook) | `[auth.hook.password_verification_attempt]` |
| Anonymous sign-ins, manual linking | off | `[auth]` |

App-side values that go with them (Next.js and FastAPI env, not GoTrue):

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | frontend | Base of every emailed link (no `localhost` fallback in production) |
| `NEXT_PUBLIC_PASSWORD_MIN_LENGTH` | frontend | Same as `AUTH_PASSWORD_MIN_LENGTH` |
| `PASSWORD_BREACH_CHECK` | frontend | `hibp` in production |
| `AUTH_METHODS` | frontend | Enabled sign-in methods (`password` today) |
| `AUTH_RATE_LIMIT_<ACTION>_PER_IP` / `_PER_ACCOUNT`, `AUTH_RATE_LIMIT_WINDOW_SECONDS` | frontend | Next.js limits (in memory, one process: put a shared store behind several instances) |
| `REAUTH_MAX_AGE_SECONDS` | frontend + backend | Recent sign-in for 2FA enroll, recovery codes, purge |
| `MFA_RECOVERY_CODE_COUNT`, `MFA_RECOVERY_ACCOUNT_RATE_LIMIT` | backend | Recovery codes (D-23) |
| `MFA_RECOVERY_CODES_EMAIL` | backend | Emails a copy of new recovery codes to the verified address. **Must stay `false` in production** (emailing codes weakens 2FA: the inbox becomes a second factor) unless the owner deliberately enables it. `true` only in local dev (`.env.example`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS` (`none`/`starttls`/`ssl`) | backend | Mail sent by the API (`app/services/mail_service.py`). Locally Mailpit `127.0.0.1:55345`, no auth, `none` |
| `AUTH_AUDIT_INGEST_INTERVAL_SECONDS`, `AUTH_AUDIT_INGEST_BATCH` | backend | GoTrue audit ingest job |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` | backend | D-29; unset means nobody becomes super admin by signing up |

## Parity check

First `supabase config diff` (CLI 3.0.0, linked project): it lists every `config.toml`
property whose hosted value differs; the release needs an empty diff for `[auth]`. Then read
the settings that have no `config.toml` key (HIBP) with the Management API:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" > hosted-auth.json
```

Compare at least: `site_url`, `uri_allow_list`, `jwt_exp`, `password_min_length`,
`password_required_characters`, `password_hibp_enabled`, `mailer_autoconfirm` (false),
`sms_autoconfirm` (false), `mailer_secure_email_change_enabled`,
`security_update_password_require_reauthentication`, `mailer_otp_exp`, `sessions_timebox`,
`sessions_inactivity_timeout`, `rate_limit_*`, `smtp_*`, `mfa_totp_enroll_enabled`,
`mfa_totp_verify_enabled`, `mfa_phone_*` (false), `mfa_web_authn_*` (false),
`hook_custom_access_token_*`, `hook_password_verification_attempt_*`. The release checklist
needs a clean diff. Record the date and result in the release notes.
