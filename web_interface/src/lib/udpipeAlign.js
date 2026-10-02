/**
 * Align UDPipe surface tokens to character offsets in the source text.
 * Tokens are matched left-to-right (case-sensitive first, then case-insensitive).
 */
export function alignTokensToText(text, tokens) {
  const aligned = [];
  let cursor = 0;

  for (const token of tokens) {
    const form = String(token.form || "");
    if (!form) {
      aligned.push({ ...token, start: -1, end: -1 });
      continue;
    }

    let index = text.indexOf(form, cursor);
    if (index === -1) {
      index = text.toLocaleLowerCase().indexOf(form.toLocaleLowerCase(), cursor);
    }
    if (index === -1) {
      // Skip spaces/newlines then retry once
      while (cursor < text.length && /\s/.test(text[cursor])) {
        cursor += 1;
      }
      index = text.indexOf(form, cursor);
      if (index === -1) {
        index = text.toLocaleLowerCase().indexOf(form.toLocaleLowerCase(), cursor);
      }
    }

    if (index === -1) {
      aligned.push({ ...token, start: -1, end: -1 });
      continue;
    }

    const start = index;
    const end = index + form.length;
    aligned.push({ ...token, start, end });
    cursor = end;
  }

  return aligned;
}

/**
 * Split a multi-sentence CoNLL-U string into sentence token arrays.
 */
export function parseConlluSentences(conllu) {
  const sentences = [];
  let current = [];

  for (const rawLine of String(conllu || "").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) {
      if (!line && current.length) {
        sentences.push(current);
        current = [];
      }
      continue;
    }
    const cols = line.split("\t");
    if (cols.length < 8) {
      continue;
    }
    const id = cols[0];
    if (id.includes("-") || id.includes(".")) {
      continue;
    }
    current.push({
      id: Number(id),
      form: cols[1],
      lemma: cols[2],
      upos: cols[3],
      head: Number(cols[6]),
      deprel: cols[7],
    });
  }

  if (current.length) {
    sentences.push(current);
  }

  return sentences;
}

export function childrenOf(tokens, headId) {
  return tokens.filter((token) => token.head === headId);
}
