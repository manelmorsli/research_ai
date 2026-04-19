import time
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.chunking import chunk_text
from app.services.embedding import embed_chunks
from app.services.parsers import parse_file

router = APIRouter()


@router.post("/")
async def embed_document(
    file: UploadFile = File(...),
    chunk_strategy: str = Form("paragraph"),
    embed_model: str = Form("ollama:bge-m3"),
    # classic params
    chunk_size: int = Form(500),
    overlap_type: str = Form("chars"),
    overlap_value: int = Form(50),
    snap_boundary: str = Form("none"),
    # semantic
    percentile_threshold: float = Form(85.0),
    semantic_embed_model: str = Form("bge-m3"),
    # hierarchical
    parent_chunk_size: int = Form(1024),
    child_chunk_size: int = Form(256),
    child_chunk_overlap: int = Form(50),
    # contextual / hybrid-rec-ctx
    llm_model: str = Form("qwen2.5:1.5b"),
    # hybrid-para-sem
    similarity_threshold: float = Form(0.85),
    max_merged_size: int = Form(1500),
    # section-based / markdown-headers
    min_section_size: int = Form(100),
    # pdf parsing mode
    pdf_mode: str = Form("text"),
):
    content = await file.read()
    text = parse_file(content, file.filename or "", pdf_mode=pdf_mode)

    # ── late-chunking: full-doc token embeddings via jina-embeddings-v3 ─────────
    if chunk_strategy == "late-chunking":
        try:
            from app.late_chunking.late_chunking import chunk_and_embed
        except ImportError as e:
            raise HTTPException(500, str(e))
        try:
            t0 = time.perf_counter()
            raw = chunk_and_embed(text, chunk_size=chunk_size, overlap_chars=overlap_value)
            elapsed_ms = round((time.perf_counter() - t0) * 1000)
        except RuntimeError as e:
            raise HTTPException(400, str(e))

        indexed = [{"index": i, **r} for i, r in enumerate(raw)]
        results = [
            {
                **item,
                "embedding_preview": item["embedding"][:8],
                "embedding_norm": round(sum(v**2 for v in item["embedding"])**0.5, 4),
            }
            for item in indexed
        ]
        return {
            "filename": file.filename,
            "chunk_strategy": "late-chunking",
            "embed_model": "jina:jina-embeddings-v3",
            "total_chunks": len(results),
            "embedding_dim": len(raw[0]["embedding"]) if raw else 0,
            "chunking_time_ms": elapsed_ms,
            "embedding_time_ms": 0,
            "results": results,
        }

    # ── all other strategies ──────────────────────────────────────────────────
    try:
        t0 = time.perf_counter()
        chunks = chunk_text(
            text, strategy=chunk_strategy,
            chunk_size=chunk_size,
            overlap_type=overlap_type,
            overlap_value=overlap_value,
            snap_boundary=snap_boundary,
            percentile_threshold=percentile_threshold,
            embed_model=semantic_embed_model,
            parent_chunk_size=parent_chunk_size,
            child_chunk_size=child_chunk_size,
            child_chunk_overlap=child_chunk_overlap,
            llm_model=llm_model,
            similarity_threshold=similarity_threshold,
            max_merged_size=max_merged_size,
            min_section_size=min_section_size,
        )
        chunking_time_ms = round((time.perf_counter() - t0) * 1000)
    except ValueError as e:
        raise HTTPException(400, str(e))

    texts = [c.get("contextualized_text", c["text"]) for c in chunks]
    t1 = time.perf_counter()
    embeddings = embed_chunks(texts, model=embed_model)
    embedding_time_ms = round((time.perf_counter() - t1) * 1000)

    results = [{**chunk, "embedding_preview": emb[:8], "embedding_norm": round(sum(v**2 for v in emb)**0.5, 4)}
               for chunk, emb in zip(chunks, embeddings)]

    return {
        "filename": file.filename,
        "chunk_strategy": chunk_strategy,
        "embed_model": embed_model,
        "total_chunks": len(chunks),
        "embedding_dim": len(embeddings[0]) if embeddings else 0,
        "chunking_time_ms": chunking_time_ms,
        "embedding_time_ms": embedding_time_ms,
        "results": results,
    }
