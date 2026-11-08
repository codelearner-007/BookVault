/**
 * Auth settings of the Next.js auth routes, all from env (B0.7, L7). GoTrue has its
 * own copy of the policy values in supabase/config.toml (env()), so direct calls with
 * the anon key meet the same rules.
 */
function positiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function limit(action, perIp, perAccount) {
  const key = action.toUpperCase();
  return {
    ip: positiveInt(`AUTH_RATE_LIMIT_${key}_PER_IP`, perIp),
    account: positiveInt(`AUTH_RATE_LIMIT_${key}_PER_ACCOUNT`, perAccount),
  };
}

export const AUTH_CONFIG = {
  // Enabled sign-in methods; more providers are added by config, not code.
  methods: (process.env.AUTH_METHODS || 'password')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean),
  // D-24: 'hibp' (k-anonymity range API) or 'off'; local default off (offline dev).
  breachCheck: process.env.PASSWORD_BREACH_CHECK === 'hibp' ? 'hibp' : 'off',
  breachCheckTimeoutMs: positiveInt('PASSWORD_BREACH_CHECK_TIMEOUT_MS', 2000),
  rateLimitWindowSeconds: positiveInt('AUTH_RATE_LIMIT_WINDOW_SECONDS', 900),
  rateLimits: {
    login: limit('login', 30, 10),
    signup: limit('signup', 10, 3),
    forgot: limit('forgot', 10, 3),
    reset: limit('reset', 10, 5),
    resend: limit('resend', 10, 3),
    change_password: limit('change_password', 20, 5),
    mfa_verify: limit('mfa_verify', 30, 10),
    mfa_enroll: limit('mfa_enroll', 20, 10),
    mfa_unenroll: limit('mfa_unenroll', 20, 5),
    mfa_recover: limit('mfa_recover', 20, 5),
    sessions: limit('sessions', 30, 10),
  },
};
