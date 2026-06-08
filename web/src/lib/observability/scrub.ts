import type { Breadcrumb, Event } from "@sentry/nextjs";

/**
 * PII / secret scrubbing for Sentry.
 *
 * Error monitoring is the easiest place to leak the most sensitive data into a
 * third party, so this is deny-by-default at the field level: any key that
 * looks like a credential, customer identifier, or money figure is redacted,
 * and free-form strings have emails / Moroccan phone numbers stripped. Only
 * `orgId` + `userId` are allowed through as context (attached as tags).
 *
 * Runs in every runtime (browser, node, edge) so it must stay dependency-free.
 */

const REDACTED = "[redacted]";
const MAX_DEPTH = 8;

/** Key names whose VALUES must never leave the app. Matched case-insensitively. */
const SENSITIVE_KEY = new RegExp(
  [
    // credentials / tokens
    "token",
    "secret",
    "password",
    "passwd",
    "apikey",
    "api[_-]?key",
    "accesstoken",
    "access[_-]?token",
    "authorization",
    "auth",
    "cookie",
    "credential",
    "customerid", // OzonExpress customer id
    "signing[_-]?key",
    "encryption[_-]?key",
    "dsn",
    // customer PII
    "phone",
    "email",
    "mail",
    "address",
    "addr",
    "receiver",
    "fullname",
    "firstname",
    "lastname",
    "customername",
    // money / COD
    "codprice",
    "cod[_-]?price",
    "totalprice",
    "unitprice",
    "amount",
    "price",
  ].join("|"),
  "i"
);

// Allow-listed keys that contain "name"/"id" etc. but are safe context.
const SAFE_KEY = /^(orgid|userid|id|name)$/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Moroccan phones: 0X XXXXXXXX, +212XXXXXXXXX, or a bare 9–10 digit run.
const PHONE_RE = /(\+?212|0)\s?[5-7](?:[\s.-]?\d){8}\b/g;

function isSensitiveKey(key: string): boolean {
  if (SAFE_KEY.test(key)) return false;
  // "name" alone is safe context (org name); "customerName" etc. is not.
  if (/^name$/i.test(key)) return false;
  return SENSITIVE_KEY.test(key);
}

/** Strip emails / phone numbers from a free-form string. */
export function redactString(s: string): string {
  return s.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
}

/** Recursively redact sensitive keys + free-form PII from any value. */
function deepScrub(value: unknown, depth = 0): unknown {
  if (value == null || depth > MAX_DEPTH) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => deepScrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : deepScrub(v, depth + 1);
  }
  return out;
}

/** Scrub a Sentry breadcrumb in place-ish (returns the sanitized copy). */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const next: Breadcrumb = { ...crumb };
  if (typeof next.message === "string") next.message = redactString(next.message);
  if (next.data) next.data = deepScrub(next.data) as Breadcrumb["data"];
  return next;
}

/**
 * `beforeSend` — scrub the whole event. Drops request headers/cookies wholesale
 * (auth + session live there), keeps `user.id` only, and deep-scrubs extra /
 * contexts / tags / breadcrumbs / exception messages.
 */
export function scrubEvent<T extends Event>(event: T): T {
  // User: keep id only (this is our userId). Never ip/email/username.
  if (event.user) event.user = { id: event.user.id };

  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.query_string) {
      event.request.query_string =
        typeof event.request.query_string === "string"
          ? redactString(event.request.query_string)
          : event.request.query_string;
    }
    if (typeof event.request.url === "string") {
      event.request.url = redactString(event.request.url);
    }
    if (event.request.data) event.request.data = deepScrub(event.request.data);
  }

  if (event.extra) event.extra = deepScrub(event.extra) as Event["extra"];
  if (event.contexts) event.contexts = deepScrub(event.contexts) as Event["contexts"];
  if (event.tags) event.tags = deepScrub(event.tags) as Event["tags"];

  if (typeof event.message === "string") event.message = redactString(event.message);

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (typeof ex.value === "string") ex.value = redactString(ex.value);
    }
  }

  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);

  return event;
}
