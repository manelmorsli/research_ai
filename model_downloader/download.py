from huggingface_hub import snapshot_download
import os

print("Downloading jinaai/jina-embeddings-v3 (~2 GB)...")

snapshot_download(
    repo_id="jinaai/jina-embeddings-v3",
    ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*", "*.onnx", "*.onnx_data"],
)

print("Done.")
