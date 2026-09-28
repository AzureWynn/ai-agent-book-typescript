const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'by', 'from',
  'as', 'at', 'it', 'this', 'that', 'these', 'those', 'we', 'you',
  'he', 'she', 'they', 'them', 'his', 'her', 'its', 'our', 'your',
  'but', 'not', 'no', 'yes', 'if', 'then', 'else', 'when', 'while',
  'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'must', 'shall', 'an', 's', 't',
]);

const TOKEN_RE =
  /[A-Za-z0-9._+#-]+@[A-Za-z0-9._-]+\.[A-Za-z]{2,}|0x[0-9a-fA-F]+|#[0-9a-fA-F]{3,8}|\b[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+\b|\b[A-Za-z]*[0-9]+[A-Za-z0-9]*\b|[A-Za-z]{2,}|[0-9]+(?:\.[0-9]+)+|[0-9]+/g;

function normalizeTechTerms(text: string): string {
  return text
    .replace(/c\+\+/gi, ' cpp ')
    .replace(/\.net\b/gi, ' dotnet ')
    .replace(/node\.js/gi, ' nodejs ');
}

export function tokenize(text: string): string[] {
  const normalized = normalizeTechTerms(text);
  const raw = normalized.match(TOKEN_RE) ?? [];
  return raw
    .map((t) => t.toLowerCase())
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => t.length > 0);
}
