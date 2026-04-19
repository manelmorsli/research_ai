import os
import httpx

_ollama_url = os.getenv("OLLAMA_HOST", "http://ollama:11434")


def embed_chunks(chunks: list[str], model: str) -> list[list[float]]:
    provider, model_name = model.split(":", 1)
    if provider != "ollama":
        raise ValueError(f"Unknown provider: {provider}. Only 'ollama' is supported.")
    return _embed_ollama(chunks, model_name)


def _embed_ollama(chunks: list[str], model_name: str) -> list[list[float]]:
    results = []
    with httpx.Client(base_url=_ollama_url, timeout=120) as client:
        for chunk in chunks:
            resp = client.post("/api/embeddings", json={"model": model_name, "prompt": chunk})
            resp.raise_for_status()
            results.append(resp.json()["embedding"])
    return results
