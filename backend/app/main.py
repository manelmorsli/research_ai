from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chunking, embedding, models

app = FastAPI(title="Research AI", description="Test embedding & chunking strategies")

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
