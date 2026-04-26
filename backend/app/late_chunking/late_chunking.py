"""
Late Chunking — contextual token-level embeddings pooled at chunk boundaries.

Two modes
---------
fixed   : classic late chunking — fixed chunk size, then pool token embeddings.
semantic: context-aware late chunking — use the token embeddings themselves to
          detect where the context shifts (cosine similarity drop between
          adjacent sentences), then pool tokens per detected chunk.
          No fixed size limit — chunks follow natural topic boundaries.
"""

MODEL_ID = "jinaai/jina-embeddings-v3"

_tokenizer = None
_base_model = None


# ── public API ─────────────────────────────────────────────────────────────────

def model_available() -> bool:
    try:
        from huggingface_hub import try_to_load_from_cache, _CACHED_NO_EXIST
        result = try_to_load_from_cache(MODEL_ID, "config.json")
        if result is None or result is _CACHED_NO_EXIST:
            return False
        return True
    except Exception:
        return False


def chunk_and_embed(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "chars",   # "chars" | "words" | "sentences"
    overlap_value: int = 50,
    snap_boundary: str = "none",   # "none" | "word" | "sentence"
    mode: str = "fixed",           # "fixed" | "semantic"
    similarity_threshold: float = 0.85,
) -> list[dict]:
    """
    Embed text with full-document context, split at chunk boundaries.

    mode="fixed"    — fixed chunk_size boundaries (classic late chunking).
    mode="semantic" — boundaries detected from cosine similarity drops between
                      adjacent sentence embeddings; chunk_size is ignored.
    """
    import torch

    tokenizer, base_model = _load_model()

    # Tokenize full document once
    encoding = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=8192,
        return_offsets_mapping=True,
        padding=False,
    )
    offset_mapping = encoding.pop("offset_mapping")[0].tolist()
    total_tokens = encoding["input_ids"].shape[1]

    # Single forward pass — all token embeddings carry full-document context
    with torch.no_grad():
        output = base_model(**encoding)
    token_emb = output.last_hidden_state[0]  # [seq_len, 1024]

    if mode == "semantic":
        chunk_spans = _semantic_spans(text, token_emb, offset_mapping, similarity_threshold)
    else:
        chunk_spans = _fixed_spans(text, chunk_size, overlap_type, overlap_value, snap_boundary)

    # Pool token embeddings per chunk span
    results = []
    for char_start, char_end in chunk_spans:
        chunk_txt = text[char_start:char_end].strip()
        if not chunk_txt:
            continue

        tok_idx = [
            i for i, (cs, ce) in enumerate(offset_mapping)
            if ce > char_start and cs < char_end and cs != ce
        ]

        if tok_idx:
            t_start, t_end = tok_idx[0], tok_idx[-1] + 1
        else:
            t_start, t_end = 1, min(5, total_tokens)

        chunk_emb = token_emb[t_start:t_end].mean(dim=0).tolist()

        results.append({
            "text": chunk_txt,
            "tok_start": t_start,
            "tok_end": t_end,
            "total_doc_tokens": total_tokens,
            "embedding": chunk_emb,
        })

    return results


# ── internals ──────────────────────────────────────────────────────────────────

def _fixed_spans(
    text: str,
    chunk_size: int,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    snap: str = "none",
) -> list[tuple[int, int]]:
    import re

    def _overlap_len(chunk_text: str) -> int:
        if not chunk_text or overlap_value <= 0:
            return 0
        if overlap_type == "words":
            words = chunk_text.split()
            return len(" ".join(words[-overlap_value:])) if words else 0
        elif overlap_type == "sentences":
            sents = re.split(r"(?<=[.!?])\s+", chunk_text)
            return len(" ".join(sents[-overlap_value:])) if sents else 0
        else:  # chars
            return min(overlap_value, len(chunk_text))

    spans, start = [], 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            if snap == "word":
                while end < len(text) and text[end] not in " \n\t\r":
                    end += 1
            elif snap == "sentence":
                m = re.search(r"[.!?][\"')\]]*\s", text[end:])
                if m:
                    end = end + m.end()
                else:
                    end = len(text)
        spans.append((start, end))
        if end >= len(text):
            break
        oc = _overlap_len(text[start:end])
        oc = max(0, min(oc, end - start - 1))
        start = end - oc if oc else end
    return spans


def _semantic_spans(
    text: str,
    token_emb,        # torch.Tensor [seq_len, dim]
    offset_mapping: list,
    threshold: float,
) -> list[tuple[int, int]]:
    """
    Split text at sentence boundaries where the context shifts.

    Steps:
      1. Split text into sentences.
      2. Map each sentence to its token span via offset_mapping.
      3. Mean-pool token embeddings per sentence → sentence vector.
      4. Compute cosine similarity between consecutive sentence vectors.
      5. Split into a new chunk where similarity < threshold.
    """
    import re
    import torch
    import torch.nn.functional as F

    # Split into sentences preserving their char offsets
    sentence_spans = []
    for m in re.finditer(r'[^.!?\n]+(?:[.!?]+|\n|$)', text):
        s, e = m.start(), m.end()
        if text[s:e].strip():
            sentence_spans.append((s, e))

    if not sentence_spans:
        return [(0, len(text))]

    # Mean-pool token embeddings per sentence
    sent_vecs = []
    for char_s, char_e in sentence_spans:
        tok_idx = [
            i for i, (cs, ce) in enumerate(offset_mapping)
            if ce > char_s and cs < char_e and cs != ce
        ]
        if tok_idx:
            vec = token_emb[tok_idx[0]:tok_idx[-1] + 1].mean(dim=0)
        else:
            vec = token_emb.mean(dim=0)
        sent_vecs.append(vec)

    # Cosine similarity between consecutive sentences
    sims = []
    for i in range(len(sent_vecs) - 1):
        sim = F.cosine_similarity(
            sent_vecs[i].unsqueeze(0),
            sent_vecs[i + 1].unsqueeze(0),
        ).item()
        sims.append(sim)

    # Group sentences into chunks: split wherever similarity < threshold
    chunk_spans = []
    chunk_start_idx = 0
    for i, sim in enumerate(sims):
        if sim < threshold:
            char_s = sentence_spans[chunk_start_idx][0]
            char_e = sentence_spans[i][1]
            chunk_spans.append((char_s, char_e))
            chunk_start_idx = i + 1

    # Last chunk
    char_s = sentence_spans[chunk_start_idx][0]
    char_e = sentence_spans[-1][1]
    chunk_spans.append((char_s, char_e))

    return chunk_spans


def _load_model():
    global _tokenizer, _base_model
    if _base_model is not None:
        return _tokenizer, _base_model

    if not model_available():
        raise RuntimeError(
            "jina-embeddings-v3 not found in HuggingFace Hub cache. "
            "Open Settings → Download model to fetch it first (~2 GB)."
        )
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise RuntimeError(
            "sentence-transformers is not installed. "
            "Rebuild the Docker container after adding it to requirements.txt."
        )

    from huggingface_hub import snapshot_download
    local_path = snapshot_download(MODEL_ID, local_files_only=True)
    st = SentenceTransformer(local_path, trust_remote_code=True)
    st.eval()

    transformer_module = st[0]
    _tokenizer = transformer_module.tokenizer
    _base_model = transformer_module.auto_model
    return _tokenizer, _base_model
