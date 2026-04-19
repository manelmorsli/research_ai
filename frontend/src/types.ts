export type Mode = 'chunk' | 'embed'
export type ViewMode = 'cards' | 'raw'

export interface RunParams {
  // classic
  chunkSize: number
  overlapType: string
  overlapValue: number
  snapBoundary: string
  // semantic
  percentileThreshold: number
  semanticEmbedModel: string
  // hierarchical
  parentChunkSize: number
  childChunkSize: number
  childChunkOverlap: number
  // llm
  llmModel: string
  // hybrid-sem-hier child
  hybridChildSize: number
  hybridChildOverlap: number
  // hybrid-para-sem
  similarityThreshold: number
  maxMergedSize: number
  paraSemEmbedModel: string
  // section-based / markdown-headers
  minSectionSize: number
  // pdf parsing
  pdfMode: string
  // embed model
  embedModel: string
}

export interface ChunkItem {
  index: number
  text: string
  note?: string
  // strategy-specific
  similarity_at_break?: number | null
  parent_index?: number
  parent_text?: string
  parent_similarity_at_break?: number | null
  context?: string
  context_time_ms?: number
  merged_count?: number
  avg_similarity?: number | null
  // late-chunking
  tok_start?: number
  tok_end?: number
  total_doc_tokens?: number
  // section-based / markdown-headers
  section_title?: string
  heading_level?: number
  // embed mode
  embedding_preview?: number[]
  embedding_norm?: number
}

export interface ChunkResponse {
  filename: string
  strategy: string
  total_chunks: number
  processing_time_ms: number
  chunks: ChunkItem[]
}

export interface EmbedResponse {
  filename: string
  chunk_strategy: string
  embed_model: string
  total_chunks: number
  embedding_dim: number
  chunking_time_ms: number
  embedding_time_ms: number
  results: ChunkItem[]
}

export interface ModelStatus {
  downloaded: boolean
  state: 'idle' | 'downloading' | 'ready' | 'error'
  message: string
  model_id: string
  source: string
  dims: number
  context_tokens: number
  size_gb: number
}
