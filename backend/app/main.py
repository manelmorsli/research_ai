import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chunking, embedding, models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("research_ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the jina model in a thread so the event loop stays free.
    # If the model isn't downloaded yet this silently skips.
    from app.late_chunking.late_chunking import model_available
    if model_available():
        print("INFO:     [startup] Pre-loading jina-embeddings-v3…", flush=True)
        loop = asyncio.get_event_loop()
        try:
            from app.late_chunking.late_chunking import _load_model
            await loop.run_in_executor(None, _load_model)
            print("INFO:     [startup] jina-embeddings-v3 ready — first request will be fast.", flush=True)
        except Exception as e:
            print(f"WARNING:  [startup] Could not pre-load jina model: {e}", flush=True)
    yield


app = FastAPI(
    title="Research AI",
    description="Test embedding & chunking strategies",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chunking.router, prefix="/chunk", tags=["chunking"])
app.include_router(embedding.router, prefix="/embed", tags=["embedding"])
app.include_router(models.router, prefix="/models", tags=["models"])


@app.get("/health")
def health():
    return {"status": "ok"}
