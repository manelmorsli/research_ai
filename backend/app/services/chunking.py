"""
Chunking strategies for the Research AI lab.
All strategies return list[dict] with at minimum {index, text}.

Overlap types:  chars | words | sentences
Boundary snap:  none  | word  | sentence   (fixed/recursive only)
"""

import re
import math
import os

_ollama_url = os.getenv("OLLAMA_HOST", "http://ollama:11434")


# ── public entry point ─────────────────────────────────────────────────────────

def chunk_text(text: str, strategy: str, **kw) -> list[dict]:
    text = text.strip()
    if not text:
        return []

    handlers = {
        "fixed":             _fixed,
        "sentence":          _sentence,
        "paragraph":         _paragraph,
        "recursive":         _recursive,
        "semantic":          _semantic,
        "hierarchical":      _hierarchical,
        "contextual":        _contextual,
        "hybrid-sem-hier":   _hybrid_sem_hier,
        "hybrid-rec-ctx":    _hybrid_rec_ctx,
        "hybrid-para-sem":   _hybrid_para_sem,
        "late-chunking":     _late_chunking_preview,
        "markdown-headers":  _markdown_headers,
        "sections":          _sections,
    }
    fn = handlers.get(strategy)
    if fn is None:
        raise ValueError(f"Unknown strategy: {strategy}")

    raw = fn(text, **kw)
    return [{"index": i, **item} for i, item in enumerate(raw)]


# ── classic strategies ─────────────────────────────────────────────────────────

def _fixed(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    snap_boundary: str = "none",
    **_,
) -> list[dict]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if snap_boundary != "none" and end < len(text):
            end = _snap_end(text, end, snap_boundary)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        overlap_len = len(_tail(chunk, overlap_type, overlap_value))
        start = end - overlap_len if overlap_len and overlap_len < (end - start) else end
    return [{"text": c} for c in chunks]


def _sentence(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "sentences",
    overlap_value: int = 1,
    **_,
) -> list[dict]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
    return _merge_units(sentences, chunk_size, overlap_type, overlap_value)


def _paragraph(
    text: str,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    **_,
) -> list[dict]:
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if overlap_value <= 0 or len(paras) <= 1:
        return [{"text": p} for p in paras]
    result = [paras[0]]
    for p in paras[1:]:
        tail = _tail(result[-1], overlap_type, overlap_value)
        result.append((tail + " " + p).strip() if tail else p)
    return [{"text": c} for c in result]


def _recursive(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    snap_boundary: str = "none",
    **_,
) -> list[dict]:
    separators = ["\n\n", "\n", ". ", " ", ""]

    def _split(t: str, seps: list[str]) -> list[str]:
        if not seps or len(t) <= chunk_size:
            return [t.strip()] if t.strip() else []
        sep = seps[0]
        buf, result = "", []
        for part in t.split(sep):
            cand = (buf + sep + part).strip() if buf else part.strip()
            if len(cand) <= chunk_size:
                buf = cand
            else:
                if buf:
                    result.append(buf)
                result.extend(_split(part, seps[1:]) if len(part) > chunk_size else [part.strip()])
                buf = ""
        if buf:
            result.append(buf)
        return result

    raw = [c for c in _split(text, separators) if c]
    if snap_boundary != "none":
        raw = [_snap_text(c, snap_boundary) for c in raw]

    if overlap_value <= 0 or len(raw) <= 1:
        return [{"text": c} for c in raw]

    result = [raw[0]]
    for chunk in raw[1:]:
        tail = _tail(result[-1], overlap_type, overlap_value)
        result.append((tail + " " + chunk).strip() if tail else chunk)
    return [{"text": c} for c in result if c.strip()]


# ── semantic chunking ──────────────────────────────────────────────────────────

def _semantic(
    text: str,
    percentile_threshold: float = 85.0,
    embed_model: str = "bge-m3",
    **_,
) -> list[dict]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
    if len(sentences) <= 1:
        return [{"text": s, "similarity_at_break": None} for s in sentences]

    embeddings = _embed_list(sentences, embed_model)
    sims = [_cosine(embeddings[i], embeddings[i + 1]) for i in range(len(embeddings) - 1)]

    sorted_sims = sorted(sims)
    threshold = sorted_sims[max(0, int(len(sorted_sims) * percentile_threshold / 100) - 1)]

    chunks, buf = [], [sentences[0]]
    for i, sim in enumerate(sims):
        if sim < threshold:
            chunks.append({"text": " ".join(buf), "similarity_at_break": round(sim, 4)})
            buf = [sentences[i + 1]]
        else:
            buf.append(sentences[i + 1])
    chunks.append({"text": " ".join(buf), "similarity_at_break": None})
    return chunks


# ── hierarchical parent-child ──────────────────────────────────────────────────

def _hierarchical(
    text: str,
    parent_chunk_size: int = 1024,
    child_chunk_size: int = 256,
    child_chunk_overlap: int = 50,
    **_,
) -> list[dict]:
    parents = [p["text"] for p in _fixed(text, parent_chunk_size, "chars", 0)]
    result = []
    for p_idx, parent in enumerate(parents):
        for child in _fixed(parent, child_chunk_size, "chars", child_chunk_overlap):
            result.append({"text": child["text"], "parent_index": p_idx, "parent_text": parent})
    return result


# ── contextual retrieval (Anthropic 2024) ──────────────────────────────────────

def _contextual(
    text: str,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    llm_model: str = "qwen2.5:1.5b",
    **_,
) -> list[dict]:
    base = [c["text"] for c in _paragraph(text, overlap_type, overlap_value)]
    return _add_context(base, text[:1500], llm_model)


# ── hybrid strategies ──────────────────────────────────────────────────────────

def _hybrid_sem_hier(
    text: str,
    percentile_threshold: float = 85.0,
    embed_model: str = "bge-m3",
    child_chunk_size: int = 256,
    child_chunk_overlap: int = 50,
    **_,
) -> list[dict]:
    """Semantic parents → fixed children."""
    parents = _semantic(text, percentile_threshold, embed_model)
    result = []
    for p_idx, parent in enumerate(parents):
        for child in _fixed(parent["text"], child_chunk_size, "chars", child_chunk_overlap):
            result.append({
                "text": child["text"],
                "parent_index": p_idx,
                "parent_text": parent["text"],
                "parent_similarity_at_break": parent.get("similarity_at_break"),
            })
    return result


def _hybrid_rec_ctx(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    snap_boundary: str = "none",
    llm_model: str = "qwen2.5:1.5b",
    **_,
) -> list[dict]:
    """Recursive structure-aware splitting + LLM contextual enrichment."""
    base = [c["text"] for c in _recursive(text, chunk_size, overlap_type, overlap_value, snap_boundary)]
    return _add_context(base, text[:1500], llm_model)


def _hybrid_para_sem(
    text: str,
    similarity_threshold: float = 0.85,
    embed_model: str = "bge-m3",
    max_merged_size: int = 1500,
    **_,
) -> list[dict]:
    """Paragraph splits, then merge semantically similar adjacent paragraphs."""
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if len(paras) <= 1:
        return [{"text": p, "merged_count": 1, "avg_similarity": None} for p in paras]

    embeddings = _embed_list(paras, embed_model)
    sims = [_cosine(embeddings[i], embeddings[i + 1]) for i in range(len(embeddings) - 1)]

    groups, buf, buf_sims = [], [paras[0]], []
    for i, sim in enumerate(sims):
        candidate = " ".join(buf) + " " + paras[i + 1]
        if sim >= similarity_threshold and len(candidate) <= max_merged_size:
            buf.append(paras[i + 1])
            buf_sims.append(sim)
        else:
            groups.append((buf, buf_sims))
            buf, buf_sims = [paras[i + 1]], []
    groups.append((buf, buf_sims))

    return [
        {
            "text": "\n\n".join(g),
            "merged_count": len(g),
            "avg_similarity": round(sum(s) / len(s), 4) if s else None,
        }
        for g, s in groups
    ]


# ── markdown header splitting ─────────────────────────────────────────────────

def _markdown_headers(
    text: str,
    min_section_size: int = 50,
    **_,
) -> list[dict]:
    """
    Split on Markdown headings (# / ## / ### …).
    Each section = heading line + body text until the next heading.
    """
    lines = text.split("\n")
    sections: list[dict] = []
    current_title = ""
    current_level = 0
    buf: list[str] = []

    for line in lines:
        m = re.match(r"^(#{1,6})\s+(.+)", line)
        if m:
            body = "\n".join(buf).strip()
            if body or current_title:
                chunk_text_val = f"{current_title}\n\n{body}".strip() if current_title else body
                if len(chunk_text_val) >= min_section_size or not sections:
                    sections.append({
                        "text": chunk_text_val,
                        "section_title": current_title,
                        "heading_level": current_level,
                    })
            current_level = len(m.group(1))
            current_title = m.group(2).strip()
            buf = []
        else:
            buf.append(line)

    # last section
    body = "\n".join(buf).strip()
    chunk_text_val = f"{current_title}\n\n{body}".strip() if current_title else body
    if chunk_text_val and len(chunk_text_val) >= min_section_size:
        sections.append({
            "text": chunk_text_val,
            "section_title": current_title,
            "heading_level": current_level,
        })

    return sections or [{"text": text, "section_title": "", "heading_level": 0}]


# ── section-based splitting (PDF / academic documents) ────────────────────────

# Known academic section keywords (case-insensitive)
_SECTION_KEYWORDS = {
    "abstract", "introduction", "background", "motivation", "problem statement",
    "related work", "literature review", "state of the art",
    "methodology", "methods", "materials and methods", "approach", "proposed method",
    "experimental setup", "experiments", "evaluation", "results", "findings",
    "discussion", "analysis", "contributions",
    "conclusion", "conclusions", "summary", "future work", "limitations",
    "references", "bibliography", "acknowledgements", "acknowledgments",
    "appendix", "supplementary material", "overview",
}


def _is_pdf_section_header(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 80:
        return False
    # Numbered: 1.  /  1.1  /  1.1.1  /  1)
    if re.match(r"^\d+(\.\d+)*[.)]\s+\S", s):
        return True
    # Roman numerals: I.  II.  III.
    if re.match(r"^[IVX]{1,5}[.)]\s+\S", s):
        return True
    # Known academic keyword (exact match after stripping punctuation)
    if s.lower().rstrip(".:- ") in _SECTION_KEYWORDS:
        return True
    # ALL CAPS line (title-like): at least 4 chars, not a URL
    if s.isupper() and 4 <= len(s) <= 70 and not s.startswith("HTTP"):
        return True
    return False


def _sections(
    text: str,
    min_section_size: int = 100,
    **_,
) -> list[dict]:
    """
    Split academic PDFs at section boundaries detected by:
      - Numbered headings  (1.  1.1  1.1.2)
      - Roman numerals     (I.  II.)
      - ALL CAPS lines     (ABSTRACT, INTRODUCTION …)
      - Known keywords     (Abstract, Conclusion, References …)
    """
    lines = text.split("\n")
    sections: list[dict] = []
    current_title = ""
    buf: list[str] = []

    for line in lines:
        if _is_pdf_section_header(line):
            body = "\n".join(buf).strip()
            if body or current_title:
                chunk_text_val = f"{current_title}\n\n{body}".strip() if current_title else body
                if len(chunk_text_val) >= min_section_size or not sections:
                    sections.append({
                        "text": chunk_text_val,
                        "section_title": current_title,
                    })
            current_title = line.strip()
            buf = []
        else:
            buf.append(line)

    # last section
    body = "\n".join(buf).strip()
    chunk_text_val = f"{current_title}\n\n{body}".strip() if current_title else body
    if chunk_text_val and len(chunk_text_val) >= min_section_size:
        sections.append({
            "text": chunk_text_val,
            "section_title": current_title,
        })

    # fallback: if nothing was detected, return the whole text as one chunk
    return sections or [{"text": text, "section_title": ""}]


# ── late-chunking preview (chunk-only mode) ────────────────────────────────────

def _late_chunking_preview(
    text: str,
    chunk_size: int = 500,
    overlap_type: str = "chars",
    overlap_value: int = 50,
    **_,
) -> list[dict]:
    """
    In chunk-only mode late chunking just shows the fixed boundaries.
    The contextual benefit is purely in the embeddings — use embed mode to see it.
    """
    raw = _fixed(text, chunk_size, overlap_type, overlap_value)
    return [{"text": c["text"], "note": "Use embed mode to get late-chunking contextual embeddings"} for c in raw]


# ── shared helpers ─────────────────────────────────────────────────────────────

def _add_context(chunks: list[str], doc_anchor: str, llm_model: str) -> list[dict]:
    import httpx
    import time
    result = []
    with httpx.Client(base_url=_ollama_url, timeout=180) as client:
        for chunk in chunks:
            prompt = (
                f"<document>\n{doc_anchor}\n</document>\n\n"
                f"<chunk>\n{chunk}\n</chunk>\n\n"
                "Write 1-2 sentences of context for this chunk to improve retrieval. "
                "Output only the context sentences, nothing else."
            )
            t0 = time.perf_counter()
            r = client.post("/api/generate", json={"model": llm_model, "prompt": prompt, "stream": False})
            r.raise_for_status()
            context_time_ms = round((time.perf_counter() - t0) * 1000)
            context = r.json()["response"].strip()
            result.append({
                "text": chunk,
                "context": context,
                "contextualized_text": f"{context}\n\n{chunk}",
                "context_time_ms": context_time_ms,
            })
    return result


def _embed_list(items: list[str], model: str) -> list[list[float]]:
    import httpx
    embeddings = []
    with httpx.Client(base_url=_ollama_url, timeout=120) as client:
        for s in items:
            r = client.post("/api/embeddings", json={"model": model, "prompt": s})
            r.raise_for_status()
            embeddings.append(r.json()["embedding"])
    return embeddings


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x**2 for x in a))
    nb = math.sqrt(sum(x**2 for x in b))
    return dot / (na * nb) if na and nb else 0.0


def _tail(text: str, overlap_type: str, overlap_value: int) -> str:
    """Return the last N units (chars/words/sentences) of text."""
    if not text or overlap_value <= 0:
        return ""
    if overlap_type == "words":
        return " ".join(text.split()[-overlap_value:])
    elif overlap_type == "sentences":
        sents = re.split(r"(?<=[.!?])\s+", text)
        return " ".join(sents[-overlap_value:])
    else:  # chars
        return text[-overlap_value:]


def _snap_end(text: str, end: int, boundary: str) -> int:
    """Extend position to the nearest boundary without going past text length."""
    if boundary == "word":
        while end < len(text) and text[end] not in " \n\t\r":
            end += 1
    elif boundary == "sentence":
        while end < len(text) and (end == 0 or text[end - 1] not in ".!?"):
            end += 1
    elif boundary == "paragraph":
        idx = text.find("\n\n", end)
        end = idx + 2 if idx != -1 else len(text)
    return min(end, len(text))


def _snap_text(chunk: str, boundary: str) -> str:
    return chunk.strip()


def _merge_units(units: list[str], chunk_size: int, overlap_type: str, overlap_value: int) -> list[dict]:
    chunks, buf = [], ""
    for u in units:
        u = u.strip()
        if not u:
            continue
        cand = (buf + " " + u).strip() if buf else u
        if len(cand) <= chunk_size:
            buf = cand
        else:
            if buf:
                chunks.append(buf)
            buf = u
    if buf:
        chunks.append(buf)

    if overlap_value <= 0 or len(chunks) <= 1:
        return [{"text": c} for c in chunks]

    result = [chunks[0]]
    for chunk in chunks[1:]:
        tail = _tail(result[-1], overlap_type, overlap_value)
        merged = (tail + " " + chunk).strip() if tail else chunk
        result.append(merged)
    return [{"text": c} for c in result]
