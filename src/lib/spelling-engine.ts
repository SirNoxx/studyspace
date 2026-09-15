import nspell from "nspell";
import { extract, ratio } from "fuzzball";

/** Hunspell supplies spelling rules; Fuzzball broadens candidates for severe typos. */
export function createSpellingEngine(aff: string, dic: string) {
  const spell = nspell(aff, dic);
  const words = [
    ...new Set(
      dic
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.split(/[\/\t ]/)[0])
        .filter((word) => /^[a-z]{2,48}$/.test(word) && spell.correct(word)),
    ),
  ];
  for (const stem of [...words]) {
    for (const ending of ["s", "es", "ed", "d", "ing", "ly", "er", "ness"]) {
      const candidate = stem + ending;
      if (spell.correct(candidate)) words.push(candidate);
    }
  }
  const lexicon = [...new Set(words)];
  const cache = new Map<string, string[]>();
  return {
    correct: (word: string) => spell.correct(word.replaceAll("’", "'")),
    suggest(word: string) {
      const normalized = word.replaceAll("’", "'");
      const found = cache.get(normalized);
      if (found) return found;
      const standard = spell.suggest(normalized);
      const lower = normalized.toLowerCase();
      const fuzzy: string[] =
        lower.length < 4
          ? []
          : extract(lower, lexicon, {
              scorer: ratio,
              cutoff: 62,
              limit: 12,
              full_process: false,
            }).map((result) => result[0]);
      const candidates = [...new Set([...standard, ...fuzzy])];
      candidates.sort(
        (a, b) =>
          ratio(lower, b.toLowerCase()) +
          (standard.includes(b) ? 3 : 0) -
          (ratio(lower, a.toLowerCase()) + (standard.includes(a) ? 3 : 0)),
      );
      const suggestions = [
        ...new Set(
          candidates
            .filter((candidate) =>
              candidate.split(" ").every((part) => spell.correct(part)),
            )
            .map((candidate) => {
              if (normalized === normalized.toUpperCase())
                return candidate.toUpperCase();
              if (/^[A-Z][a-z]+$/.test(normalized))
                return candidate[0].toUpperCase() + candidate.slice(1);
              return candidate;
            }),
        ),
      ].slice(0, 8);
      if (cache.size >= 300) cache.delete(cache.keys().next().value!);
      cache.set(normalized, suggestions);
      return suggestions;
    },
  };
}
