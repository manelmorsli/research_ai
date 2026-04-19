import time
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.chunking import chunk_text
from app.services.parsers import parse_file

router = APIRouter()


@router.post("/")
async def chunk_document(
    file: UploadFile = File(...),
    strategy: str = Form("paragraph"),
    # classic params
    chunk_size: int = Form(500),
    overlap_type: str = Form("chars"),       # chars | words | sentences
    overlap_value: int = Form(50),
    snap_boundary: str = Form("none"),        # none | word | sentence
    # semantic params
    percentile_threshold: float = Form(85.0),
    embed_model: str = Form("bge-m3"),
    # hierarchical params
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

    try:
        t0 = time.perf_counter()
        chunks = chunk_text(
            text, strategy=strategy,
            chunk_size=chunk_size,
            overlap_type=overlap_type,
            overlap_value=overlap_value,
            snap_boundary=snap_boundary,
            percentile_threshold=percentile_threshold,
            embed_model=embed_model,
            parent_chunk_size=parent_chunk_size,
            child_chunk_size=child_chunk_size,
            child_chunk_overlap=child_chunk_overlap,
            llm_model=llm_model,
            similarity_threshold=similarity_threshold,
            max_merged_size=max_merged_size,
            min_section_size=min_section_size,
        )
        processing_time_ms = round((time.perf_counter() - t0) * 1000)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return {
        "filename": file.filename,
        "strategy": strategy,
        "total_chunks": len(chunks),
        "processing_time_ms": processing_time_ms,
        "chunks": chunks,
    }
