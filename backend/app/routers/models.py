"""
Model management router.

GET  /models/status              — HuggingFace jina model status
POST /models/download            — start HF jina download in background

GET  /models/ollama/list         — installed Ollama models
GET  /models/ollama/catalog      — curated list of pullable models
POST /models/ollama/pull         — start pulling an Ollama model
GET  /models/ollama/pull/status  — active pull progress
"""
import sys
import json
import logging
import os

import httpx
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

router = APIRouter()
log = logging.getLogger("research_ai")

_ollama_url = os.getenv("OLLAMA_HOST", "http://ollama:11434")

# ── in-memory state ────────────────────────────────────────────────────────────
_hf_state: dict = {"state": "idle", "message": "Model not downloaded yet."}
_pull_state: dict = {"state": "idle", "model": "", "message": "", "progress": 0}

# ── curated Ollama catalog ─────────────────────────────────────────────────────
OLLAMA_CATALOG = [
    # ── Embedding models ─────────────────────────────────────────────────────
    {
        "name": "bge-m3",
        "type": "embedding",
        "dims": 1024,
        "context": "8192",
        "size": "~570 MB",
        "note": "Multilingual, best quality — used by default",
    },
    {
        "name": "nomic-embed-text",
        "type": "embedding",
        "dims": 768,
        "context": "8192",
        "size": "~274 MB",
        "note": "Fast, English-focused, large context",
    },
    {
        "name": "mxbai-embed-large",
        "type": "embedding",
        "dims": 1024,
        "context": "512",
        "size": "~670 MB",
        "note": "High quality embeddings, shorter context",
    },
    {
        "name": "all-minilm",
        "type": "embedding",
        "dims": 384,
        "context": "512",
        "size": "~46 MB",
        "note": "Lightweight — fastest option",
    },
    # ── LLM models ────────────────────────────────────────────────────────────
    {
        "name": "qwen2.5:1.5b",
        "type": "llm",
        "dims": None,
        "context": "32 768",
        "size": "~934 MB",
        "note": "Fast local LLM — used for contextual chunking",
    },
    {
        "name": "qwen2.5:3b",
        "type": "llm",
        "dims": None,
        "context": "32 768",
        "size": "~1.9 GB",
        "note": "Better quality contextual chunks, slower",
    },
    {
        "name": "llama3.2:1b",
        "type": "llm",
        "dims": None,
        "context": "131 072",
        "size": "~1.3 GB",
        "note": "Meta — fast inference, huge context",
    },
    {
        "name": "phi3.5",
        "type": "llm",
        "dims": None,
        "context": "128 000",
        "size": "~2.2 GB",
        "note": "Microsoft — high quality for its size",
    },
]

# ── HuggingFace models catalog ─────────────────────────────────────────────────
HF_CATALOG = [
    {
        "model_id": "jinaai/jina-embeddings-v3",
        "dims": 1024,
        "context_tokens": 8192,
        "size": "~2 GB",
        "note": "Required for Late Chunking strategy — single forward-pass contextual embeddings",
        "key": "jina",
    },
]


# ── HuggingFace jina endpoints ─────────────────────────────────────────────────

@router.get("/status")
def model_status():
    from app.late_chunking.late_chunking import model_available
    ready = model_available()
    return {
        "downloaded": ready,
        "state": "ready" if ready else _hf_state["state"],
        "message": "jina-embeddings-v3 is ready." if ready else _hf_state["message"],
        "model_id": "jinaai/jina-embeddings-v3",
        "source": "HuggingFace Hub",
        "dims": 1024,
        "context_tokens": 8192,
        "size_gb": 2.0,
    }


@router.post("/download")
def start_download(bg: BackgroundTasks):
    from app.late_chunking.late_chunking import model_available
    if model_available():
        return {"ok": False, "message": "Already downloaded."}
    if _hf_state["state"] == "downloading":
        return {"ok": False, "message": "Download already in progress."}
    _hf_state["state"] = "downloading"
    _hf_state["message"] = "Starting download of jinaai/jina-embeddings-v3…"
    bg.add_task(_do_hf_download)
    return {"ok": True, "message": "Download started in background (~2 GB, may take several minutes)."}


def _do_hf_download():
    _hf_state["message"] = "Downloading jinaai/jina-embeddings-v3 (~2 GB) from HuggingFace Hub…"
    try:
        try:
            from huggingface_hub import snapshot_download
        except ImportError:
            import subprocess
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "huggingface_hub", "-q"],
                check=True,
            )
            from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="jinaai/jina-embeddings-v3",
            ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*"],
        )
        _hf_state["state"] = "ready"
        _hf_state["message"] = "Download complete. Restart the container to load the model."
    except Exception as e:
        _hf_state["state"] = "error"
        _hf_state["message"] = f"Download failed: {e}"


# ── Ollama endpoints ───────────────────────────────────────────────────────────

@router.get("/ollama/list")
def ollama_list():
    """Return all models currently installed in the Ollama container."""
    try:
        r = httpx.get(f"{_ollama_url}/api/tags", timeout=5)
        r.raise_for_status()
        return {"models": r.json().get("models", []), "error": None}
    except Exception as e:
        log.warning("[MODELS] ollama list failed | %s", e)
        return {"models": [], "error": str(e)}


@router.get("/ollama/catalog")
def ollama_catalog():
    return {"catalog": OLLAMA_CATALOG}


class PullRequest(BaseModel):
    model: str


@router.post("/ollama/pull")
def ollama_pull(body: PullRequest, bg: BackgroundTasks):
    name = body.model.strip()
    if not name:
        return {"ok": False, "message": "No model name provided."}
    if _pull_state["state"] == "pulling":
        return {"ok": False, "message": f"Already pulling {_pull_state['model']}. Wait for it to finish."}
    _pull_state.update({"state": "pulling", "model": name, "message": f"Starting pull for {name}…", "progress": 0})
    log.info("[MODELS] ollama pull start | model=%s", name)
    bg.add_task(_do_ollama_pull, name)
    return {"ok": True, "message": f"Pull started for {name}."}


@router.get("/ollama/pull/status")
def ollama_pull_status():
    return dict(_pull_state)


def _do_ollama_pull(model_name: str):
    try:
        with httpx.Client(base_url=_ollama_url, timeout=3600) as client:
            with client.stream("POST", "/api/pull", json={"name": model_name, "stream": True}) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    total = d.get("total", 0)
                    completed = d.get("completed", 0)
                    pct = round(completed / total * 100) if total else 0
                    _pull_state.update({"message": d.get("status", ""), "progress": pct})
        _pull_state.update({"state": "done", "message": f"{model_name} pulled successfully.", "progress": 100})
        log.info("[MODELS] ollama pull done | model=%s", model_name)
    except Exception as e:
        _pull_state.update({"state": "error", "message": f"Pull failed: {e}", "progress": 0})
        log.error("[MODELS] ollama pull error | model=%s | %s", model_name, e)
