import time
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.chunking import chunk_text
from app.services.embedding import embed_chunks
from app.services.parsers import parse_file

router = APIRouter()
log = logging.getLogger("research_ai")


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
    # late-chunking mode
    late_chunk_mode: str = Form("fixed"),
    # pdf parsing mode
    pdf_mode: str = Form("text"),
):
    content = await file.read()
    text = parse_file(content, file.filename or "", pdf_mode=pdf_mode)

    # ── late-chunking: full-doc token embeddings via jina-embeddings-v3 ─────────
    if chunk_strategy == "late-chunking":
        log.info(
            "[EMBED] request | file=%s | strategy=late-chunking | mode=%s | chunk_size=%s | overlap=%s/%s | threshold=%.2f | pdf=%s",
            file.filename, late_chunk_mode, chunk_size, overlap_type, overlap_value, percentile_threshold / 100, pdf_mode,
        )
        try:
            from app.late_chunking.late_chunking import chunk_and_embed
        except ImportError as e:
            log.error("[EMBED] import error | late-chunking | %s", e)
            raise HTTPException(500, str(e))
        try:
            t0 = time.perf_counter()
            raw = chunk_and_embed(
                text,
                chunk_size=chunk_size,
                overlap_type=overlap_type,
                overlap_value=overlap_value,
                snap_boundary=snap_boundary,
                mode=late_chunk_mode,
                similarity_threshold=percentile_threshold / 100,
            )
            elapsed_ms = round((time.perf_counter() - t0) * 1000)
        except RuntimeError as e:
            log.error("[EMBED] error | file=%s | strategy=late-chunking | %s", file.filename, e)
            raise HTTPException(400, str(e))
        except Exception as e:
            import traceback
            log.error("[EMBED] error | file=%s | strategy=late-chunking | %s\n%s", file.filename, e, traceback.format_exc())
            raise HTTPException(500, f"Late chunking failed: {type(e).__name__}: {e}")

        indexed = [{"index": i, **r} for i, r in enumerate(raw)]
        results = [
            {
                **item,
                "embedding_preview": item["embedding"][:8],
                "embedding_norm": round(sum(v**2 for v in item["embedding"])**0.5, 4),
            }
            for item in indexed
        ]
        log.info(
            "[EMBED] done  | file=%s | strategy=late-chunking | model=jina-v3 | chunks=%d | time=%dms",
            file.filename, len(results), elapsed_ms,
        )
        return {
            "filename": file.filename,
            "chunk_strategy": chunk_strategy,
            "embed_model": "jina:jina-embeddings-v3",
            "total_chunks": len(results),
            "embedding_dim": len(raw[0]["embedding"]) if raw else 0,
            "chunking_time_ms": elapsed_ms,
            "embedding_time_ms": 0,
            "results": results,
        }

    # ── all other strategies ──────────────────────────────────────────────────
    log.info(
        "[EMBED] request | file=%s | strategy=%s | model=%s | chunk_size=%s | overlap=%s/%s | pdf=%s",
        file.filename, chunk_strategy, embed_model, chunk_size, overlap_type, overlap_value, pdf_mode,
    )
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
        log.error("[EMBED] error | file=%s | strategy=%s | chunking failed | %s", file.filename, chunk_strategy, e)
        raise HTTPException(400, str(e))

    t1 = time.perf_counter()
    embeddings = embed_chunks([c["text"] for c in chunks], model=embed_model)
    embedding_time_ms = round((time.perf_counter() - t1) * 1000)
    log.info(
        "[EMBED] embedded | file=%s | strategy=%s | chunks=%d | embed_time=%dms",
        file.filename, chunk_strategy, len(chunks), embedding_time_ms,
    )

    # For contextual strategies, generate LLM context AFTER embedding
    context_time_ms = 0
    if chunk_strategy in ("contextual", "hybrid-rec-ctx"):
        from app.services.chunking import _add_context
        t2 = time.perf_counter()
        ctx_results = _add_context([c["text"] for c in chunks], text[:1500], llm_model)
        context_time_ms = round((time.perf_counter() - t2) * 1000)
        for chunk, ctx in zip(chunks, ctx_results):
            chunk["context"] = ctx["context"]
            chunk["contextualized_text"] = ctx["contextualized_text"]
            chunk["context_time_ms"] = ctx["context_time_ms"]
        log.info(
            "[EMBED] context  | file=%s | strategy=%s | chunks=%d | context_time=%dms",
            file.filename, chunk_strategy, len(chunks), context_time_ms,
        )

    log.info(
        "[EMBED] done  | file=%s | strategy=%s | model=%s | chunks=%d | chunk_time=%dms | embed_time=%dms | context_time=%dms",
        file.filename, chunk_strategy, embed_model, len(chunks), chunking_time_ms, embedding_time_ms, context_time_ms,
    )
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
        "context_time_ms": context_time_ms if context_time_ms else None,
        "results": results,
    }
