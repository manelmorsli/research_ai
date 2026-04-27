import type { RunParams, ChunkResponse, EmbedResponse, ModelStatus, OllamaInstalledModel, OllamaCatalogItem, OllamaPullStatus } from './types'
import { STRATEGY_CONFIG } from './config'

// All API calls go through Vite's proxy at /api → research-backend:8001
const BASE = '/api'

// ── chunking ──────────────────────────────────────────────────────────────────

export async function runChunking(
  file: File,
  strategy: string,
  params: RunParams,
): Promise<ChunkResponse> {
  const fd = buildFormData(file, strategy, params, 'chunk')
  const resp = await fetch(`${BASE}/chunk/`, { method: 'POST', body: fd })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as any).detail || resp.statusText)
  }
  return resp.json()
}

// ── embedding ─────────────────────────────────────────────────────────────────

export async function runEmbedding(
  file: File,
  strategy: string,
  params: RunParams,
): Promise<EmbedResponse> {
  const fd = buildFormData(file, strategy, params, 'embed')
  const resp = await fetch(`${BASE}/embed/`, { method: 'POST', body: fd })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as any).detail || resp.statusText)
  }
  return resp.json()
}

// ── models ────────────────────────────────────────────────────────────────────

export async function getModelStatus(): Promise<ModelStatus> {
  const resp = await fetch(`${BASE}/models/status`)
  return resp.json()
}

export async function downloadModel(): Promise<{ ok: boolean; message: string }> {
  const resp = await fetch(`${BASE}/models/download`, { method: 'POST' })
  return resp.json()
}

export async function getOllamaList(): Promise<{ models: OllamaInstalledModel[]; error: string | null }> {
  const resp = await fetch(`${BASE}/models/ollama/list`)
  return resp.json()
}

export async function getOllamaCatalog(): Promise<{ catalog: OllamaCatalogItem[] }> {
  const resp = await fetch(`${BASE}/models/ollama/catalog`)
  return resp.json()
}

export async function pullOllamaModel(model: string): Promise<{ ok: boolean; message: string }> {
  const resp = await fetch(`${BASE}/models/ollama/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  return resp.json()
}

export async function getOllamaPullStatus(): Promise<OllamaPullStatus> {
  const resp = await fetch(`${BASE}/models/ollama/pull/status`)
  return resp.json()
}

// ── form builder ──────────────────────────────────────────────────────────────

function buildFormData(
  file: File,
  strategy: string,
  params: RunParams,
  mode: 'chunk' | 'embed',
): FormData {
  const fd = new FormData()
  fd.append('file', file)
  fd.append(mode === 'embed' ? 'chunk_strategy' : 'strategy', strategy)

  const cfg = STRATEGY_CONFIG[strategy]
  const panels = cfg?.panels ?? []

  if (panels.includes('chunk-size')) fd.append('chunk_size', String(params.chunkSize))
  if (panels.includes('boundary')) fd.append('snap_boundary', params.snapBoundary)
  if (panels.includes('overlap')) {
    fd.append('overlap_type', params.overlapType)
    fd.append('overlap_value', String(params.overlapValue))
  }
  if (panels.includes('semantic')) {
    fd.append('percentile_threshold', String(params.percentileThreshold))
    fd.append(
      mode === 'embed' ? 'semantic_embed_model' : 'embed_model',
      params.semanticEmbedModel,
    )
  }
  if (panels.includes('late-chunk')) {
    fd.append('late_chunk_mode', params.lateChunkMode)
    fd.append('chunk_size', String(params.chunkSize))
    fd.append('overlap_type', params.overlapType)
    fd.append('overlap_value', String(params.overlapValue))
    fd.append('snap_boundary', params.snapBoundary)
    fd.append('percentile_threshold', String(params.percentileThreshold))
  }
  if (panels.includes('hierarchical')) {
    fd.append('parent_chunk_size', String(params.parentChunkSize))
    fd.append('child_chunk_size', String(params.childChunkSize))
    fd.append('child_chunk_overlap', String(params.childChunkOverlap))
  }
  if (panels.includes('llm')) fd.append('llm_model', params.llmModel)
  if (panels.includes('hybrid-child')) {
    fd.append('child_chunk_size', String(params.hybridChildSize))
    fd.append('child_chunk_overlap', String(params.hybridChildOverlap))
  }
  if (panels.includes('para-sem')) {
    fd.append('similarity_threshold', String(params.similarityThreshold))
    fd.append('max_merged_size', String(params.maxMergedSize))
    fd.append(
      mode === 'embed' ? 'semantic_embed_model' : 'embed_model',
      params.paraSemEmbedModel,
    )
  }
  if (panels.includes('section')) {
    fd.append('min_section_size', String(params.minSectionSize))
  }

  fd.append('pdf_mode', params.pdfMode)

  if (mode === 'embed') fd.append('embed_model', params.embedModel)

  return fd
}
