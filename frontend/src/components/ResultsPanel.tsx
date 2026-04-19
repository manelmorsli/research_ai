import type { ChunkResponse, EmbedResponse, ViewMode, Mode } from '../types'
import ChunkCard from './ChunkCard'

interface Props {
  results: ChunkResponse | EmbedResponse | null
  mode: Mode
  strategy: string
  loading: boolean
  error: string | null
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export default function ResultsPanel({
  results, mode, strategy, loading, error, viewMode, setViewMode,
}: Props) {
  const items = results
    ? (mode === 'embed' && 'results' in results ? results.results : 'chunks' in results ? results.chunks : [])
    : []

  const chunkMs = results
    ? (('processing_time_ms' in results ? results.processing_time_ms : undefined)
        ?? ('chunking_time_ms' in results ? results.chunking_time_ms : undefined))
    : undefined

  const embedMs = results && 'embedding_time_ms' in results ? results.embedding_time_ms : undefined
  const embedDim = results && 'embedding_dim' in results ? results.embedding_dim : undefined
  const embedModel = results && 'embed_model' in results ? results.embed_model : undefined

  return (
    <main className="results-panel">
      {/* ── toolbar (only when results exist) ── */}
      {results && !loading && (
        <div className="toolbar">
          <span className="toolbar-stat">
            Chunks: <strong>{results.total_chunks}</strong>
          </span>
          <span className="toolbar-stat">
            Strategy: <strong>{'strategy' in results ? results.strategy : results.chunk_strategy}</strong>
          </span>
          {chunkMs != null && (
            <span className="toolbar-stat">
              Time: <strong>{fmtMs(chunkMs)}</strong>
            </span>
          )}
          {embedMs != null && embedMs > 0 && (
            <span className="toolbar-stat">
              Embed: <strong>{fmtMs(embedMs)}</strong>
            </span>
          )}
          {embedDim != null && (
            <span className="toolbar-stat">
              Dim: <strong>{embedDim}</strong>
            </span>
          )}
          {embedModel && (
            <span className="toolbar-stat model-tag">
              {embedModel.startsWith('jina:') ? '🤗' : '🦙'} {embedModel.replace('ollama:', '').replace('jina:', '')}
            </span>
          )}
          <div className="view-toggle">
            <button
              className={`view-btn${viewMode === 'cards' ? ' active' : ''}`}
              onClick={() => setViewMode('cards')}
            >Cards</button>
            <button
              className={`view-btn${viewMode === 'raw' ? ' active' : ''}`}
              onClick={() => setViewMode('raw')}
            >Raw JSON</button>
          </div>
        </div>
      )}

      {/* ── loading ── */}
      {loading && (
        <div className="state-center">
          <div className="spinner" />
          <p>Processing…</p>
        </div>
      )}

      {/* ── placeholder ── */}
      {!loading && !results && !error && (
        <div className="state-center placeholder">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p>Upload a document and click <strong>Run</strong></p>
        </div>
      )}

      {/* ── error ── */}
      {!loading && error && (
        <div className="state-center">
          <div className="error-msg">Error: {error}</div>
        </div>
      )}

      {/* ── cards ── */}
      {!loading && results && viewMode === 'cards' && (
        <div className="cards-scroll">
          <div className="cards-list">
            {items.map(item => (
              <ChunkCard key={item.index} item={item} strategy={strategy} mode={mode} />
            ))}
          </div>
        </div>
      )}

      {/* ── raw JSON ── */}
      {!loading && results && viewMode === 'raw' && (
        <div className="raw-scroll">
          <pre className="raw-json">{JSON.stringify(results, null, 2)}</pre>
        </div>
      )}
    </main>
  )
}
