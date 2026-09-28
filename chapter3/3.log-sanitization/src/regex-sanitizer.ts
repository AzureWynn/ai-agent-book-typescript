import { RedactionRule, RedactionResult, RedactionCategory, SanitizationSummary } from "./types.js";
import { VERBOSE } from "./config.js";

function luhnOk(number: string): boolean {
  const digits = number.replace(/\D/g, "").split("").map(Number);
  if (digits.length < 13 || digits.length > 19) return false;
  let checksum = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === parity) { d *= 2; if (d > 9) d -= 9; }
    checksum += d;
  }
  return checksum % 10 === 0;
}

function cnIdOk(value: string): boolean {
  const s = value.toUpperCase();
  if (s.length !== 18 || !s.slice(0, 17).match(/^\d{17}$/)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = "10X98765432";
  const total = s.slice(0, 17).split("").reduce((sum, c, i) => sum + parseInt(c) * weights[i], 0);
  return checkCodes[total % 11] === s[17];
}

export const RULES: RedactionRule[] = [
  { category: "private_key", placeholder: "[REDACTED_PRIVATE_KEY]", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|$)/g, group: 0 },
  { category: "jwt", placeholder: "[REDACTED_JWT]", pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, group: 0 },
  { category: "url_credential", placeholder: "[REDACTED_URL_CRED]", pattern: /:\/\/([^:\s]+):([^@]+)@/g, group: [1, 2] },
  { category: "aws_access_key", placeholder: "[REDACTED_AWS_KEY]", pattern: /\bAKIA[0-9A-Z]{16}\b/g, group: 0 },
  { category: "github_token", placeholder: "[REDACTED_GITHUB_TOKEN]", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\b/g, group: 0 },
  { category: "slack_token", placeholder: "[REDACTED_SLACK_TOKEN]", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, group: 0 },
  { category: "google_api_key", placeholder: "[REDACTED_GOOGLE_API_KEY]", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, group: 0 },
  { category: "api_key", placeholder: "[REDACTED_API_KEY]", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, group: 0 },
  { category: "bearer_token", placeholder: "[REDACTED_BEARER_TOKEN]", pattern: /\bBearer\s+([A-Za-z0-9._~+/=-]{10,})/gi, group: 1 },
  { category: "basic_auth", placeholder: "[REDACTED_BASIC_AUTH]", pattern: /\bAuthorization\s*:\s*Basic\s+([A-Za-z0-9+/=]{4,})/gi, group: 1 },
  { category: "secret_assignment", placeholder: "[REDACTED_SECRET]", pattern: /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth|credential)["']?\s*[=:]\s*(?:"([^"]{4,})"|'([^']{4,})'|([^\s"'{},]{4,}))/gi, group: [1, 2, 3] },
  { category: "email", placeholder: "[REDACTED_EMAIL]", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, group: 0 },
  { category: "credit_card", placeholder: "[REDACTED_CREDIT_CARD]", pattern: /\b(?:\d[ -]?){13,19}\b/g, group: 0, validator: luhnOk },
  { category: "iban", placeholder: "[REDACTED_IBAN]", pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, group: 0 },
  { category: "us_ssn", placeholder: "[REDACTED_SSN]", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, group: 0 },
  { category: "cn_id_card", placeholder: "[REDACTED_ID_CARD]", pattern: /\b\d{17}[\dXx]\b/g, group: 0, validator: cnIdOk },
  { category: "cn_phone", placeholder: "[REDACTED_PHONE]", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g, group: 0 },
  { category: "ip_address", placeholder: "[REDACTED_IP]", pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, group: 0 },
];

export function sanitize(text: string): RedactionResult {
  const redactions: RedactionResult["redactions"] = [];
  let sanitized = text;

  for (const rule of RULES) {
    const matches = [...sanitized.matchAll(rule.pattern)];
    for (const match of matches) {
      const groups = Array.isArray(rule.group) ? rule.group : [rule.group];
      const values = groups.flatMap(g => {
        const val = match[g];
        return val ? [val] : [];
      });

      for (const value of values) {
        if (rule.validator && !rule.validator(value)) continue;
        sanitized = sanitized.replace(value, rule.placeholder);
        redactions.push({ category: rule.category, originalValue: value, placeholder: rule.placeholder });
        if (VERBOSE) console.log(`  [${rule.category}] "${value.slice(0, 20)}..." → ${rule.placeholder}`);
      }
    }
  }

  return { original: text, sanitized, redactions };
}

export function sanitizeAll(texts: string[]): RedactionResult[] {
  return texts.map(t => sanitize(t));
}

export function getSummary(results: RedactionResult[]): SanitizationSummary {
  const byCategory: Record<string, number> = {};
  for (const r of results) {
    for (const red of r.redactions) {
      byCategory[red.category] = (byCategory[red.category] || 0) + 1;
    }
  }
  return {
    totalRedactions: results.reduce((s, r) => s + r.redactions.length, 0),
    byCategory,
    samples: results.slice(0, 5),
  };
}
