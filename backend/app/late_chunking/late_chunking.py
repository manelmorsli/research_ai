"""
Late Chunking — contextual token-level embeddings pooled at chunk boundaries.

Key idea
--------
Regular chunking embeds each chunk in isolation → "information island" effect.
Late chunking instead:
  1. Passes the ENTIRE document through jina-embeddings-v3 (8192-token context
     window) so every token embedding is already aware of the whole document.
  2. Defines fixed-size chunk boundaries on the raw text.
  3. Mean-pools the token hidden-states that fall inside each chunk boundary.

Result: every chunk embedding carries full-document context.

Model source: HuggingFace — jinaai/jina-embeddings-v3  (~2 GB)
Stored at:    app/late_chunking/embed_model/
"""
from pathlib import Path

MODEL_PATH = Path(__file__).parent / "embed_model"

# Lazy singletons — loaded once on first call, reused forever.
_tokenizer = None
_base_model = None


# ── public API ─────────────────────────────────────────────────────────────────

def model_available() -> bool:
    """True if the model weights are present on disk."""
    return (MODEL_PATH / "config.json").exists() and (
        (MODEL_PATH / "model.safetensors").exists()
        or (MODEL_PATH / "pytorch_model.bin").exists()
    )


def chunk_and_embed(
    text: str,
    chunk_size: int = 500,
    overlap_chars: int = 50,
) -> list[dict]:
    """
    Chunk text using fixed-size boundaries, embed with full-document context.

    Returns list of dicts:
      { text, tok_start, tok_end, total_doc_tokens, embedding }
    """
    import torch

    tokenizer, base_model = _load_model()

    # Step 1 — fixed chunk boundaries (char-level)
    chunks_text = _fixed_chunks(text, chunk_size, overlap_chars)
    if not chunks_text:
        return []

    # Step 2 — tokenize full document, capture char↔token offset map
    encoding = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=8192,
        return_offsets_mapping=True,
        padding=False,
    )
    offset_mapping = encoding.pop("offset_mapping")[0].tolist()  # [(char_s, char_e)]
    total_tokens = encoding["input_ids"].shape[1]

    # Step 3 — forward pass on full document
    with torch.no_grad():
        output = base_model(**encoding)
    token_emb = output.last_hidden_state[0]  # [seq_len, 1024]

    # Step 4 — per chunk: find token span via offset map, mean-pool
    results = []
    search_from = 0
    for chunk_txt in chunks_text:
        char_start = text.find(chunk_txt, search_from)
        if char_start == -1:
            char_start = search_from
        char_end = char_start + len(chunk_txt)
        search_from = char_start + 1

        tok_idx = [
            i for i, (cs, ce) in enumerate(offset_mapping)
            if ce > char_start and cs < char_end and cs != ce  # skip special tokens
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

def _load_model():
    global _tokenizer, _base_model
    if _base_model is not None:
        return _tokenizer, _base_model

    if not model_available():
        raise RuntimeError(
            "jina-embeddings-v3 not found in late_chunking/embed_model/. "
            "Open Settings → Download model to fetch it first (~2 GB)."
        )
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise RuntimeError(
            "sentence-transformers is not installed. "
            "Rebuild the Docker container after adding it to requirements.txt."
        )

    # SentenceTransformer handles the custom_st.py module loading automatically.
    st = SentenceTransformer(str(MODEL_PATH), trust_remote_code=True)
    st.eval()

    # We only need the underlying HuggingFace model + tokenizer for token-level output.
    transformer_module = st[0]          # custom_st.Transformer wrapper
    _tokenizer = transformer_module.tokenizer
    _base_model = transformer_module.auto_model
    return _tokenizer, _base_model


def _fixed_chunks(text: str, chunk_size: int, overlap_chars: int) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        ov = min(overlap_chars, end - start - 1)
        start = end - ov if ov > 0 else end
    return chunks
