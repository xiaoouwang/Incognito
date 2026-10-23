/**
 * Browser GLiNER-relex ONNX runtime adapted from
 * g-gonzalez-brena/gliner-relex-base-onnx examples/onnx-relex-runtime.js
 */
import * as ort from "onnxruntime-web";
import { AutoTokenizer, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
// Match installed onnxruntime-web major; CDN avoids Vite package-export issues for .wasm.
ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

function toOrtModel(source) {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (ArrayBuffer.isView(source)) {
    return source;
  }
  return source;
}

// (which throws "document is not defined" in production preview builds).


export class OnnxRelexRuntime {
  constructor({
    entityModelUrl,
    relationModelUrl,
    tokenizerPath,
    tokenizerRevision = "main",
    specialTokensUrl,
    maxWidth = 12,
    maxEntities = 12,
    adjacencyThreshold = 0.5,
  }) {
    this.entityModelUrl = entityModelUrl;
    this.relationModelUrl = relationModelUrl;
    this.tokenizerPath = tokenizerPath;
    this.tokenizerRevision = tokenizerRevision;
    this.specialTokensUrl = specialTokensUrl;
    this.maxWidth = maxWidth;
    this.maxEntities = maxEntities;
    this.adjacencyThreshold = adjacencyThreshold;

    this.entityThreshold = 0.3;
    this.relationThreshold = 0.5;
  }


    isLikelyLocalPath(value) {
      return typeof value === "string" && /^(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)/.test(value);
    }

    isLikelyHubRepoId(value) {
      return typeof value === "string" && /^[^/\s]+\/[^/\s]+$/.test(value);
    }

    buildTokenizerOptions() {
      const isLocalTokenizer = this.isLikelyLocalPath(this.tokenizerPath);

      env.allowLocalModels = isLocalTokenizer;
      env.allowRemoteModels = !isLocalTokenizer;

      if (isLocalTokenizer) {
        return { local_files_only: true };
      }

      const options = {};
      if (this.isLikelyHubRepoId(this.tokenizerPath)) {
        options.revision = this.tokenizerRevision;
      }
      return options;
    }

    async init() {
      const providers = [];
      if (typeof navigator !== "undefined" && navigator.gpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) providers.push("webgpu");
        } catch {
          // fall through to wasm
        }
      }
      providers.push("wasm");
      this.executionProviders = providers;

      const sessionOptions = {
        executionProviders: providers,
        graphOptimizationLevel: "all",
      };

      this.entitySession = await ort.InferenceSession.create(
        toOrtModel(this.entityModelUrl),
        sessionOptions,
      );
      this.relationSession = await ort.InferenceSession.create(
        toOrtModel(this.relationModelUrl),
        sessionOptions,
      );

      this.tokenizer = await AutoTokenizer.from_pretrained(
        this.tokenizerPath,
        this.buildTokenizerOptions(),
      );

      // console.log("Entity session:", this.entitySession);
      // console.log("Entity input names:", this.entitySession.inputNames);
      // console.log("Entity output names:", this.entitySession.outputNames);

      // console.log("Relation session:", this.relationSession);
      // console.log("Relation input names:", this.relationSession.inputNames);
      // console.log("Relation output names:", this.relationSession.outputNames);

      const specialTokensResponse = await fetch(this.specialTokensUrl);
      const specialTokens = await specialTokensResponse.json();

      this.entToken = specialTokens.ent_token;
      this.relToken = specialTokens.rel_token;
      this.sepToken = specialTokens.sep_token;

      this.clsId = specialTokens.cls_token_id;
      this.sepId = specialTokens.sep_token_id;
      this.padId = specialTokens.pad_token_id;
      this.unkId = specialTokens.unk_token_id;

      // console.log("Entity ONNX inputs:", this.entitySession.inputNames);
      // console.log("Entity ONNX outputs:", this.entitySession.outputNames);

      // console.log("Relation ONNX inputs:", this.relationSession.inputNames);
      // console.log("Relation ONNX outputs:", this.relationSession.outputNames);
    }

  async prepare({ text, entityLabels, relationLabels = [] }) {
    const { words, starts, ends } = this.splitWordsWithOffsets(text);

    const prompt = [];

    for (const ent of entityLabels) {
      prompt.push(this.entToken, String(ent));
    }

    prompt.push(this.sepToken);

    for (const rel of relationLabels) {
      prompt.push(this.relToken, String(rel));
    }

    prompt.push(this.sepToken);

    const promptLength = prompt.length;
    const inputWords = [...prompt, ...words];


    const { inputIds, attentionMask, wordIds } =
      await this.tokenizeWithWordAlignment(inputWords);

    const wordsMaskValues = this.buildWordsMaskExact(wordIds, promptLength);

    // console.log("wordIds", wordIds);
    // console.log("words_mask", wordsMaskValues);

      // console.log("inputIds length:", inputIds.length);
      // console.log("attentionMask length:", attentionMask.length);
      // console.log("wordsMask length:", wordsMaskValues.length);
      // console.log("wordIds:", wordIds);
      // console.log("wordsMask:", wordsMaskValues);

      

    const inputIdsTensor = BigInt64Array.from(inputIds.map(BigInt));
    const attentionMaskTensor = BigInt64Array.from(attentionMask.map(BigInt));
    const wordsMaskTensor = BigInt64Array.from(wordsMaskValues.map(BigInt));
    const textLengths = BigInt64Array.from([BigInt(words.length)]);

    const span = this.prepareSpans(words, this.maxWidth);

    // console.log("span dims:", span.dims);

    const feeds = {};

    //for (const name of this.inputNames) {
    for (const name of this.entitySession.inputNames) {
      if (name === "input_ids") {
        feeds[name] = new ort.Tensor("int64", inputIdsTensor, [1, inputIds.length]);
      } else if (name === "attention_mask") {
        feeds[name] = new ort.Tensor("int64", attentionMaskTensor, [1, attentionMask.length]);
      } else if (name === "words_mask") {
        feeds[name] = new ort.Tensor("int64", wordsMaskTensor, [1, wordsMaskValues.length]);
      } else if (name === "text_lengths" || name === "seq_length") {
        feeds[name] = new ort.Tensor("int64", textLengths, [1, 1]);
      } else if (name === "span_idx") {
        feeds[name] = new ort.Tensor("int64", span.idxData, span.idxDims)
      } else if (name === "span_mask") {   
        feeds[name] = new ort.Tensor("bool", span.maskData, span.maskDims); 
      } else {
        throw new Error(`Unsupported ONNX input: ${name}`);
      }
    }


    // console.log("inputIds length:", inputIds.length);
    // console.log("attentionMask length:", attentionMask.length);
    // console.log("wordsMask length:", wordsMaskValues.length);
    // console.log("span idx dims:", span.idxDims);
    // console.log("span mask dims:", span.maskDims);

    // console.log("input_ids", Array.from(feeds.input_ids.data).map(Number));
    // console.log("attention_mask", Array.from(feeds.attention_mask.data).map(Number));
    // console.log("words_mask", Array.from(feeds.words_mask.data).map(Number));
    // console.log("text_lengths", Array.from(feeds.text_lengths.data).map(Number));

    const meta = {
      text,
      tokenWords: words,
      startOffsets: starts,
      endOffsets: ends,
      entityLabels,
      relationLabels
    };

    return { feeds, meta };
  }

  filterEntities(entities) {
  const sorted = [...entities]
    .filter(e => e.score >= this.entityThreshold)
    .sort((a, b) => b.score - a.score);

  const kept = [];

  function overlaps(a, b) {
    return !(a.end_token < b.start_token || b.end_token < a.start_token);
  }

  for (const candidate of sorted) {
    if (!kept.some(existing => overlaps(candidate, existing))) {
      kept.push(candidate);
    }

    if (kept.length >= this.maxEntities) {
      break;
    }
  }

  return kept.sort((a, b) => a.start_token - b.start_token);
}


  sigmoid(x) {
    const v = Math.max(-80, Math.min(80, x));
    return 1 / (1 + Math.exp(-v));
  }

  splitWordsWithOffsets(text) {
    const regex = /\w+(?:[-_]\w+)*|[^\w\s]/g;
    const words = [];
    const starts = [];
    const ends = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      words.push(match[0]);
      starts.push(match.index);
      ends.push(match.index + match[0].length);
    }

    return { words, starts, ends };
  }


  async tokenizeWordNoSpecials(word) {
    const encoded = await this.tokenizer(word, {
      add_special_tokens: false,
      padding: false,
      truncation: false
    });

    let ids = this.extractInputIds(encoded);

    // Safety: remove CLS/SEP if tokenizer still adds them.
    if (
      ids.length >= 2 &&
      ids[0] === this.clsId &&
      ids[ids.length - 1] === this.sepId
    ) {
      ids = ids.slice(1, -1);
    }

    return ids;
  }

  findSpanIndex(entitySpansTensor, entity) {
    const spans = entitySpansTensor.data;
    const spanCount = entitySpansTensor.dims[1];

    for (let i = 0; i < spanCount; i++) {
      const s = Number(spans[i * 2]);
      const e = Number(spans[i * 2 + 1]);

      if (s === entity.start_token && e === entity.end_token) {
        return i;
      }
    }

    return -1;
  }

  greedySearch(spans) {
    const sorted = [...spans].sort((a, b) => b.score - a.score);
    const kept = [];  

    for (const cand of sorted) {
      if (!kept.some(existing => this.overlaps(cand, existing))) {
        kept.push(cand);
      }
    }

    return kept.sort((a, b) => a.startToken - b.startToken);
  }

  overlaps(a, b) {
    return !(a.endToken < b.startToken || b.endToken < a.startToken);
  }

  prepareSpans(tokens, maxWidth) {
    const spanIdx = [];
    const spanMask = [];

    for (let i = 0; i < tokens.length; i++) {
      for (let j = 0; j < maxWidth; j++) {
        const end = Math.min(i + j, tokens.length - 1);
        spanIdx.push(i, end);
        spanMask.push(1);
      }
    }

    return {
      idxData: BigInt64Array.from(spanIdx.map(BigInt)),
      idxDims: [1, tokens.length * maxWidth, 2],
      maskData: new Uint8Array(spanMask),//BigInt64Array.from(spanMask.map(BigInt)),
      maskDims: [1, tokens.length * maxWidth]
    };
  }

  buildCandidatePairs(entitySpansTensor, entities, adjacencyLogitsTensor = null) {
    const spanIndexes = entities
    .map(e => e.span_index)
    .filter(i => Number.isInteger(i) && i >= 0);

    const pairData = [];
    const pairScores = [];
    const spanCount = entitySpansTensor.dims[1];
    const rawAdjacencyData = adjacencyLogitsTensor?.data ?? null;
    const hasUsableAdjacency = rawAdjacencyData
      ? Array.from(rawAdjacencyData).some(value => Math.abs(Number(value)) > 1e-6)
      : false;
    const adjacencyData = hasUsableAdjacency ? rawAdjacencyData : null;

    const adjacencyScore = (headIdx, tailIdx) => {
      if (!adjacencyData) return 1;
      return this.sigmoid(adjacencyData[(headIdx * spanCount) + tailIdx]);
    };

    for (let i = 0; i < spanIndexes.length; i++) {
      for (let j = 0; j < spanIndexes.length; j++) {
        if (i === j) continue;
        const headIdx = spanIndexes[i];
        const tailIdx = spanIndexes[j];
        const score = adjacencyScore(headIdx, tailIdx);

        if (score <= this.adjacencyThreshold) continue;

        pairData.push(headIdx, tailIdx);
        pairScores.push(score);
      }
    }

    const realPairCount = pairData.length / 2;

    if (pairData.length === 0) {
      // Evita tensor vacío. Luego no devolveremos relaciones.
      pairData.push(0, 0);
    }

    return {
      data: BigInt64Array.from(pairData.map(BigInt)),
      dims: [1, pairData.length / 2, 2],
      realPairCount,
      adjacencyScores: pairScores,
    };
  }

async tokenizeWithWordAlignment(inputWords) {
  const words = inputWords.map(x => String(x));
  const fullText = words.join(" ");

  const encoded = await this.tokenizer(fullText, {
    add_special_tokens: true,
    padding: false,
    truncation: false,
  });

  const inputIds = this.extractInputIds(encoded);

  let attentionMask;
  if (encoded.attention_mask) {
    attentionMask = this.extractArray(encoded.attention_mask);
  } else {
    attentionMask = new Array(inputIds.length).fill(1);
  }

  const encodedNoSpecial = await this.tokenizer(fullText, {
    add_special_tokens: false,
    padding: false,
    truncation: false,
  });

  const noSpecialIds = this.extractInputIds(encodedNoSpecial);

  const bodyStart = this.findSubsequence(inputIds, noSpecialIds);
  if (bodyStart < 0) {
    throw new Error("Could not locate no-special token sequence inside input_ids");
  }

  const wordIds = new Array(inputIds.length).fill(null);

  let cursor = bodyStart;

  const reconstructed = [];

  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const piece = wordIndex === 0
      ? words[wordIndex]
      : " " + words[wordIndex];

    const pieceEncoded = await this.tokenizer(piece, {
      add_special_tokens: false,
      padding: false,
      truncation: false,
    });

    const pieceIds = this.extractInputIds(pieceEncoded);

    reconstructed.push(...pieceIds);

    for (let k = 0; k < pieceIds.length; k++) {
      wordIds[cursor + k] = wordIndex;
    }

    cursor += pieceIds.length;
  }

  // Important debug: the reconstruction must match fullText tokenization.
  const same =
    reconstructed.length === noSpecialIds.length &&
    reconstructed.every((id, i) => id === noSpecialIds[i]);

  if (!same) {
    console.warn("Token reconstruction mismatch");

    throw new Error(
      "Per-word token reconstruction does not match full-text tokenization"
    );
  }

  return { inputIds, attentionMask, wordIds };
}

extractWordIds(encoded) {
  // Python-style BatchEncoding method
  if (typeof encoded.word_ids === "function") {
    try {
      return encoded.word_ids(0).map(x => x == null ? null : Number(x));
    } catch {
      return encoded.word_ids().map(x => x == null ? null : Number(x));
    }
  }

  // Some Transformers.js builds expose word_ids directly
  if (Array.isArray(encoded.word_ids)) {
    const w = Array.isArray(encoded.word_ids[0])
      ? encoded.word_ids[0]
      : encoded.word_ids;

    return w.map(x => x == null ? null : Number(x));
  }

  // Some builds expose low-level encodings
  const candidates = [
    encoded.encodings?.[0]?.word_ids,
    encoded.encodings?.[0]?.wordIds,
    encoded._encodings?.[0]?.word_ids,
    encoded._encodings?.[0]?.wordIds,
    encoded.encoding?.word_ids,
    encoded.encoding?.wordIds,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map(x => x == null ? null : Number(x));
    }
  }

  // console.log("Tokenizer encoded object keys:", Object.keys(encoded));
  // console.log("Full encoded object:", encoded);

  throw new Error("Tokenizer did not expose word_ids");
}


extractArray(x) {
  if (!x) {
    throw new Error("Missing tokenizer field");
  }

  if (typeof x.tolist === "function") {
    return x.tolist().flat(Infinity).map(Number);
  }

  if (x.data && (ArrayBuffer.isView(x.data) || Array.isArray(x.data))) {
    return Array.from(x.data).map(Number);
  }

  if (Array.isArray(x)) {
    return x.flat(Infinity).map(Number);
  }

  throw new Error("Unsupported array format: " + String(x));
}

findSubsequence(haystack, needle) {
  if (!needle.length) return -1;

  outer:
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }

  return -1;
}



extractOffsets(encoded) {
  const x = encoded.offset_mapping;

  if (!x) {
    throw new Error("Tokenizer did not return offset_mapping");
  }

  let flat;

  if (typeof x.tolist === "function") {
    flat = x.tolist().flat(Infinity).map(Number);
  } else if (x.data && (ArrayBuffer.isView(x.data) || Array.isArray(x.data))) {
    flat = Array.from(x.data).map(Number);
  } else if (Array.isArray(x)) {
    flat = x.flat(Infinity).map(Number);
  } else {
    throw new Error("Unsupported offset_mapping format: " + String(x));
  }

  if (flat.length % 2 !== 0) {
    throw new Error(`Invalid offset_mapping length: ${flat.length}`);
  }

  const offsets = [];
  for (let i = 0; i < flat.length; i += 2) {
    offsets.push([flat[i], flat[i + 1]]);
  }

  return offsets;
}

  extractInputIds(encoded) {
    const x = encoded.input_ids;

    if (!x) {
      throw new Error("Tokenizer output has no input_ids");
    }

    if (typeof x.tolist === "function") {
      return x.tolist().flat(Infinity).map(Number);
    }

    if (x.data && (ArrayBuffer.isView(x.data) || Array.isArray(x.data))) {
      return Array.from(x.data).map(Number);
    }

    if (Array.isArray(x)) {
      return x.flat(Infinity).map(Number);
    }

    throw new Error("Unsupported input_ids format: " + String(x));
  }


buildWordsMaskExact(wordIds, promptLength) {
  const wordsMask = [];
  let prevWid = null;

  for (const wid of wordIds) {
    if (wid === null || wid === undefined) {
      wordsMask.push(0);
    } else if (wid < promptLength) {
      // Prompt token: labels / <<ENT>> / <<REL>> / <<SEP>>
      wordsMask.push(0);
    } else if (wid !== prevWid) {
      // First subtoken of a real text word.
      // GLiNER word ids are 1-based for text words.
      wordsMask.push(wid - promptLength + 1);
    } else {
      // Continuation subtoken
      wordsMask.push(0);
    }

    prevWid = wid;
  }

  return wordsMask;
}

  /**
   * Map a char span onto ReLex word-token indices (inclusive end token).
   * Returns null when the span cannot be covered within maxWidth.
   */
  mapCharSpanToTokens(meta, start, end) {
    const { startOffsets, endOffsets, tokenWords } = meta;
    if (!tokenWords?.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }

    let startToken = -1;
    let endToken = -1;
    for (let index = 0; index < tokenWords.length; index += 1) {
      const tokenStart = startOffsets[index];
      const tokenEnd = endOffsets[index];
      if (startToken < 0 && tokenEnd > start && tokenStart < end) {
        startToken = index;
      }
      if (tokenStart < end && tokenEnd > start) {
        endToken = index;
      }
    }

    if (startToken < 0 || endToken < startToken) {
      return null;
    }

    const width = endToken - startToken;
    if (width >= this.maxWidth) {
      // Prefer the head of long spans so pair lookup still works.
      endToken = startToken + this.maxWidth - 1;
    }

    return {
      start_token: startToken,
      end_token: endToken,
      span_index: startToken * this.maxWidth + (endToken - startToken),
    };
  }

  /**
   * Align caller-provided NER spans onto ReLex token indices for the relation head.
   */
  alignExternalEntities(meta, externalEntities = []) {
    const aligned = [];
    const seen = new Set();

    const sorted = [...(externalEntities || [])].sort((left, right) => {
      const leftLen = (Number(left.end) || 0) - (Number(left.start) || 0);
      const rightLen = (Number(right.end) || 0) - (Number(right.start) || 0);
      if (rightLen !== leftLen) {
        return rightLen - leftLen;
      }
      return (Number(left.start) || 0) - (Number(right.start) || 0);
    });

    for (const entity of sorted) {
      const start = Number(entity.start);
      const end = Number(entity.end);
      const mapped = this.mapCharSpanToTokens(meta, start, end);
      if (!mapped) {
        continue;
      }

      const key = `${mapped.start_token}:${mapped.end_token}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const label =
        typeof entity.label === "string"
          ? entity.label
          : entity.label?.name || entity.label?.label || "misc";
      const charStart = meta.startOffsets[mapped.start_token];
      const charEnd = meta.endOffsets[mapped.end_token];
      const surface = entity.text || meta.text.slice(charStart, charEnd);

      aligned.push({
        start_token: mapped.start_token,
        end_token: mapped.end_token,
        start: Number.isFinite(start) ? start : charStart,
        end: Number.isFinite(end) ? end : charEnd,
        text: surface,
        label,
        score: Number(entity.score) || 1,
        span_index: mapped.span_index,
        source: entity.source || "external",
      });

      if (aligned.length >= Math.max(this.maxEntities, 48)) {
        break;
      }
    }

    return aligned.sort((left, right) => left.start_token - right.start_token);
  }

  async runRelationPass(meta, entityOutputs, entities) {
    const relationPromptCount = entityOutputs.rel_prompts_embedding?.dims?.[1];
    if (relationPromptCount !== meta.relationLabels.length) {
      throw new Error(
        `Invalid relation prompt embeddings: got ${relationPromptCount}, expected ${meta.relationLabels.length}. ` +
          "Re-export entity_model.onnx so rel_prompts_embedding is extracted from <<REL>> tokens, not <<ENT>> prompts.",
      );
    }

    if (entities.length < 2) {
      return [];
    }

    const pair = this.buildCandidatePairs(
      entityOutputs.entity_spans,
      entities,
      entityOutputs.adjacency_logits,
    );

    if (pair.realPairCount === 0) {
      return [];
    }

    const relationOutputs = await this.relationSession.run({
      span_rep: entityOutputs.span_rep,
      rel_prompts_embedding: entityOutputs.rel_prompts_embedding,
      candidate_pair_idx: new ort.Tensor("int64", pair.data, pair.dims),
    });

    return this.decodeRelations(
      meta,
      relationOutputs.relation_logits,
      relationOutputs.relation_indices,
      entityOutputs.entity_spans,
      entities,
    );
  }

  async run({ text, entityLabels, relationLabels = [], return_relations = true }) {

    // aparently this fixated relations when not interesd in them ,returns better entities.
    if (!return_relations)
      relationLabels = ['fits_inside', 'heavier_than']

    // convert each entityLabel to string: name: description.
    // only if entityLabels is an array of objects not strings
    const entityLabelsStr = entityLabels.map(e => {
      if (typeof e === "string") {
        return e;
      } else {
        return `${this.normalizeField(e.name)}: ${e.description}`;
      }
    });

    const { feeds, meta } = await this.prepare({
      text,
      entityLabels: entityLabelsStr,
      relationLabels,
    });

    const entityOutputs = await this.entitySession.run(feeds);

    let entities = this.decodeEntities(meta, entityLabels, entityOutputs.entity_logits);
    entities = this.filterEntities(entities);
    const entitiesByLabel = this.buildEntitiesByLabelMap(entities);

    if (!return_relations) {
      return {
        entities,
        entitiesByLabel,
        relations: [],
        relation_entities: [],
      };
    }

    const relations = await this.runRelationPass(meta, entityOutputs, entities);
    const relation_entities = relations.map((relation) => this.toRelationEntity(relation));

    return {
      entities,
      entitiesByLabel,
      relations,
      relation_entities,
    };
  }

  /**
   * Relation extraction over caller-provided entity spans (e.g. GLiNER2-multi).
   * Still runs the entity ONNX for span_rep / embeddings; does not return model NER.
   */
  async runRelationsOnEntities({
    text,
    entities: externalEntities = [],
    entityLabels = [],
    relationLabels = [],
  }) {
    const labels =
      entityLabels?.length > 0
        ? entityLabels
        : [...new Set((externalEntities || []).map((entity) => entity.label).filter(Boolean))];
    const entityLabelsStr = labels.map((label) =>
      typeof label === "string" ? label : `${this.normalizeField(label.name)}: ${label.description}`,
    );
    if (!entityLabelsStr.includes("person")) {
      entityLabelsStr.push("person");
    }

    const { feeds, meta } = await this.prepare({
      text,
      entityLabels: entityLabelsStr,
      relationLabels,
    });

    const entityOutputs = await this.entitySession.run(feeds);
    const entities = this.alignExternalEntities(meta, externalEntities);
    const relations = await this.runRelationPass(meta, entityOutputs, entities);

    return {
      entities,
      relations,
      relation_entities: relations.map((relation) => this.toRelationEntity(relation)),
    };
  }

  toRelationEntity(relation) {
    return {
      relation_name: relation?.relation,
      head_entity: this.toRelationEntityEndpoint(relation?.head),
      tail_entity: this.toRelationEntityEndpoint(relation?.tail),
      score: relation?.score,
      relation,
    };
  }

  toRelationEntityEndpoint(entity) {
    const labelObj = entity?.label;

    if (labelObj && typeof labelObj === "object") {
      return {
        ...labelObj,
        label: entity?.text ?? labelObj.label ?? labelObj.name,
        text: entity?.text ?? "",
        score: entity?.score,
      };
    }

    return entity?.text ?? String(labelObj ?? "");
  }

  buildEntitiesByLabelMap(entities = []) {
    const grouped = new Map();

    for (const ent of entities) {
      const label = String(ent?.label ?? "");
      const text = String(ent?.text ?? "").trim();
      const score = Number(ent?.score ?? 0);
      if (!label || !text) continue;

      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label).push({ text, score });
    }

    const result = {};
    for (const [label, items] of grouped.entries()) {
      const bestByText = new Map();
      for (const item of items) {
        const prev = bestByText.get(item.text);
        if (!prev || item.score > prev.score) {
          bestByText.set(item.text, item);
        }
      }

      const orderedTexts = Array.from(bestByText.values())
        .sort((a, b) => b.score - a.score)
        .map(item => item.text);

      result[label] = orderedTexts.join(", ");
    }

    return result;
  }


  decodeEntities(meta, entityLabels, tensor) {
    const data = tensor.data;
    const [, numTokens, numLabels, numChannels] = tensor.dims;

    if (numChannels !== 3) {
      throw new Error(
        `Expected token-level logits [B, L, C, 3], got dims=${JSON.stringify(tensor.dims)}`
      );
    }

    const raw = [];

    const at = (tokenIdx, labelIdx, channelIdx) => {
      return data[((tokenIdx * numLabels + labelIdx) * numChannels) + channelIdx];
    };

    const maxTokens = Math.min(numTokens, meta.tokenWords.length);
    const maxLabels = Math.min(numLabels, meta.entityLabels.length);

    const starts = [];
    const ends = [];

    for (let tokenIdx = 0; tokenIdx < maxTokens; tokenIdx++) {
      for (let labelIdx = 0; labelIdx < maxLabels; labelIdx++) {
        const startScore = this.sigmoid(at(tokenIdx, labelIdx, 0));
        const endScore = this.sigmoid(at(tokenIdx, labelIdx, 1));

        if (startScore > this.entityThreshold) {
          starts.push({ tokenIdx, labelIdx, score: startScore });
        }

        if (endScore > this.entityThreshold) {
          ends.push({ tokenIdx, labelIdx, score: endScore });
        }
      }
    }

    for (const st of starts) {
      for (const ed of ends) {
        if (st.labelIdx !== ed.labelIdx) continue;
        if (ed.tokenIdx < st.tokenIdx) continue;

        const width = ed.tokenIdx - st.tokenIdx;
        if (width >= this.maxWidth) continue;

        let ok = true;
        let score = Math.min(st.score, ed.score);

        // Official-style inside validation
        for (let pos = st.tokenIdx; pos <= ed.tokenIdx; pos++) {
          const insideScore = this.sigmoid(at(pos, st.labelIdx, 2));

          if (insideScore < this.entityThreshold) {
            ok = false;
            break;
          }

          score = Math.min(score, insideScore);
        }

        if (!ok) continue;

        raw.push({
          startToken: st.tokenIdx,
          endToken: ed.tokenIdx,
          label: entityLabels[st.labelIdx],
          labelIdx: st.labelIdx,
          score,

          // This is still useful for relation span_rep lookup.
          // It assumes prepareSpans order: start * maxWidth + width.
          spanIndex: st.tokenIdx * this.maxWidth + width,
        });
      }
    }

    const kept = this.greedySearch(raw);

    return kept.map(ent => {
      const start = meta.startOffsets[ent.startToken];
      const end = meta.endOffsets[ent.endToken];

      return {
        start_token: ent.startToken,
        end_token: ent.endToken,
        start,
        end,
        text: meta.text.slice(start, end),
        label: ent.label,
        labelIdx: ent.labelIdx,
        score: ent.score,
        span_index: ent.spanIndex,
      };
    });
  }

  decodeRelations(meta, relationLogits, relationIndices, entitySpans, entities) {
    const logits = relationLogits.data;
    const indices = relationIndices.data;
    const spans = entitySpans.data;

    const [, numPairs, numRelClasses] = relationLogits.dims;

    const accepted = new Map();

    for (const ent of entities) {
      accepted.set(`${ent.start_token}:${ent.end_token}`, ent);
    }

    const candidateSpans = [];

    for (let i = 0; i < entitySpans.dims[1]; i++) {
      const s = Number(spans[i * 2]);
      const e = Number(spans[i * 2 + 1]);

      if (s < 0 || e < s || s >= meta.tokenWords.length) {
        candidateSpans.push(null);
        continue;
      }

      const endTok = Math.min(e, meta.tokenWords.length - 1);

      candidateSpans.push({
        startToken: s,
        endToken: endTok
      });
    }

    const kept = new Map();

    for (let p = 0; p < numPairs; p++) {
      const headIdx = Number(indices[p * 2]);
      const tailIdx = Number(indices[p * 2 + 1]);

      const headSpan = candidateSpans[headIdx];
      const tailSpan = candidateSpans[tailIdx];

      if (!headSpan || !tailSpan) continue;

      const head = accepted.get(`${headSpan.startToken}:${headSpan.endToken}`);
      const tail = accepted.get(`${tailSpan.startToken}:${tailSpan.endToken}`);

      if (!head || !tail) continue;

      for (let k = 0; k < Math.min(numRelClasses, meta.relationLabels.length); k++) {
        const score = this.sigmoid(logits[p * numRelClasses + k]);

        if (score <= this.relationThreshold) continue;

        const key = `${head.start_token}:${head.end_token}:${k}:${tail.start_token}:${tail.end_token}`;

        const current = {
          head,
          relation: meta.relationLabels[k],
          tail,
          score
        };

        const previous = kept.get(key);
        if (!previous || current.score > previous.score) {
          kept.set(key, current);
        }
      }
    }

    return Array.from(kept.values()).sort((a, b) => {
      return (
        a.head.start_token - b.head.start_token ||
        a.tail.start_token - b.tail.start_token ||
        b.score - a.score
      );
    });
  }

  debugTopEntityLogits(meta, tensor, minScore = 0.25) {
    const data = tensor.data;
    const [, numTokens, numLabels, numChannels] = tensor.dims;
    const channels = ["start", "end", "inside"];

    const at = (t, l, c) => {
      return data[((t * numLabels + l) * numChannels) + c];
    };

    const rows = [];

    for (let t = 0; t < numTokens; t++) {
      for (let l = 0; l < numLabels; l++) {
        for (let c = 0; c < numChannels; c++) {
          const score = this.sigmoid(at(t, l, c));
          if (score >= minScore) {
            rows.push({
              token: t,
              word: meta.tokenWords[t],
              label: meta.entityLabels[l],
              channel: channels[c] ?? c,
              score,
              logit: at(t, l, c),
            });
          }
        }
      }
    }

    //console.table(rows.sort((a, b) => b.score - a.score));
  }

  normalizeField(key) {
    return String(key)
      // camelCase -> camel Case
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // snake_case / kebab-case -> spaces
      .replace(/[_-]+/g, " ")
      // extra spaces
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
}
