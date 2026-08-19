import { parseVoiceTranscript } from "./expenseVoiceParse";
import { getVoiceFieldsForTipo, voiceFieldAliases } from "./expenseVoiceFields";

function normStream_(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,.;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoundary_(text, pos, len) {
  const before = pos === 0 ? " " : text[pos - 1];
  const afterPos = pos + len;
  const after = afterPos >= text.length ? " " : text[afterPos];
  return (pos === 0 || /\s/.test(before)) && (afterPos >= text.length || /\s/.test(after));
}

function findTriggers_(normText, fields) {
  const hits = [];
  for (const field of fields) {
    for (const alias of voiceFieldAliases(field)) {
      const a = normStream_(alias);
      if (a.length < 2) continue;
      let from = 0;
      while (from < normText.length) {
        const pos = normText.indexOf(a, from);
        if (pos < 0) break;
        if (isBoundary_(normText, pos, a.length)) {
          hits.push({ pos, end: pos + a.length, field, alias: a, aliasLen: a.length });
        }
        from = pos + 1;
      }
    }
  }
  return hits;
}

function pickHits_(hits) {
  const byPos = new Map();
  for (const h of hits) {
    const prev = byPos.get(h.pos);
    if (!prev || h.aliasLen > prev.aliasLen) byPos.set(h.pos, h);
  }
  const sorted = [...byPos.values()].sort((a, b) => a.pos - b.pos);
  const out = [];
  let lastEnd = -1;
  for (const h of sorted) {
    if (h.pos < lastEnd) continue;
    out.push(h);
    lastEnd = h.end;
  }
  return out;
}

/**
 * Interpreta un dictado continuo: «fecha repostaje 15 02 26 entidad los llanos …»
 * @returns {Record<string, string>}
 */
export function parseContinuousVoiceTranscript(transcript, tipo) {
  const fields = getVoiceFieldsForTipo(tipo);
  const normText = normStream_(transcript);
  if (!normText || !fields.length) return {};

  const hits = pickHits_(findTriggers_(normText, fields));
  const out = {};

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].end;
    const end = i + 1 < hits.length ? hits[i + 1].pos : normText.length;
    const rawSegment = normText.slice(start, end).trim();
    if (!rawSegment) continue;
    const parsed = parseVoiceTranscript(hits[i].field, rawSegment);
    const value = String(parsed || rawSegment).trim();
    if (value) out[hits[i].field.key] = value;
  }

  return out;
}

export function parseContinuousVoiceTranscriptList(transcript, tipo) {
  const map = parseContinuousVoiceTranscript(transcript, tipo);
  const fields = getVoiceFieldsForTipo(tipo);
  return fields
    .filter((f) => map[f.key])
    .map((f) => ({ key: f.key, label: f.label, value: map[f.key] }));
}
