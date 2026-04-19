"""
Model management router.

GET  /models/status   — check if jina-embeddings-v3 is downloaded
POST /models/download — kick off background download from HuggingFace Hub
"""
import sys
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks

router = APIRouter()

_MODEL_PATH = Path(__file__).parent.parent / "late_chunking" / "embed_model"
_state: dict = {"state": "idle", "message": "Model not downloaded yet."}


@router.get("/status")
def model_status():
    from app.late_chunking.late_chunking import model_available
    ready = model_available()
    return {
        "downloaded": ready,
        "state": "ready" if ready else _state["state"],
        "message": "jina-embeddings-v3 is ready." if ready else _state["message"],
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
    if _state["state"] == "downloading":
        return {"ok": False, "message": "Download already in progress."}
    _state["state"] = "downloading"
    _state["message"] = "Starting download of jinaai/jina-embeddings-v3…"
    bg.add_task(_do_download)
    return {"ok": True, "message": "Download started in background (~2 GB, may take several minutes)."}


def _do_download():
    _state["message"] = "Downloading jinaai/jina-embeddings-v3 (~2 GB) from HuggingFace Hub…"
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
            local_dir=str(_MODEL_PATH),
            ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*"],
        )
        _state["state"] = "ready"
        _state["message"] = "Download complete. Restart the container to load the model."
    except Exception as e:
        _state["state"] = "error"
        _state["message"] = f"Download failed: {e}"
