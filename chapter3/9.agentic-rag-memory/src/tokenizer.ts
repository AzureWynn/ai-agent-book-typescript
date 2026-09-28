const CN_STOP = new Set([
  '的', '了', '在', '是', '和', '与', '或', '如何', '怎么', '什么', '吗',
  '呢', '啊', '呀', '么', '之', '其', '有', '要', '吗', '且', '并', '被',
]);

const EN_STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'and', 'or',
  'in', 'on', 'to', 'for', 'with', 'by', 'from', 'as', 'at',
]);

const ASCII_RE = /[A-Za-z0-9._#-]+@[A-Za-z0-9._-]+\.[A-Za-z]{2,}|\b[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+\b|\b[A-Za-z]*[0-9]+[A-Za-z0-9]*\b|[A-Za-z]{2,}|[0-9]+(?:\.[0-9]+)+|[0-9]+/g;

export function tokenize(text: string): string[] {
  const cjk = [...text.matchAll(/[\u4e00-\u9fff]/g)].map((m) => m[0]);
  const ascii = (text.match(ASCII_RE) ?? []).map((t) => t.toLowerCase());
  return [...cjk, ...ascii].filter((t) => !CN_STOP.has(t) && !EN_STOP.has(t));
}
