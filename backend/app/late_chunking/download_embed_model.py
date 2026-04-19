"""
Standalone helper to download jina-embeddings-v3 into the HuggingFace Hub cache.

Prefer the Docker service:
    docker compose run --rm model-downloader

Or run this script directly if you want to pre-populate the cache outside Docker:
    HF_HOME=/huggingface python backend/app/late_chunking/download_embed_model.py
"""

import os

def main():
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("Installing huggingface_hub ...")
        os.system("pip install huggingface_hub -q")
        from huggingface_hub import snapshot_download

    hf_home = os.environ.get("HF_HOME", "~/.cache/huggingface")
    print(f"Downloading jinaai/jina-embeddings-v3 → HF cache at {hf_home}")
    print("This is ~2 GB, please wait ...\n")

    snapshot_download(
        repo_id="jinaai/jina-embeddings-v3",
        ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*"],
    )

    print("\nDone. Model is in the HuggingFace Hub cache.")
    print("If running in Docker, make sure the huggingface_hub volume is mounted.")

if __name__ == "__main__":
    main()
