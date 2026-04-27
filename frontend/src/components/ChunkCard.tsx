import { useState } from 'react'
import type { ChunkItem } from '../types'

interface Props {
  item: ChunkItem
  strategy: string
  mode: 'chunk' | 'embed'
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function ChunkCard({ item, strategy, mode }: Props) {
  const [open, setOpen] = useState(true)
  const [parentOpen, setParentOpen] = useState(false)

  const chars = item.text?.length ?? 0
  const words = item.text?.trim().split(/\s+/).filter(Boolean).length ?? 0

  const isContextual = strategy === 'contextual' || strategy === 'hybrid-rec-ctx'
  const isHierarchical = strategy === 'hierarchical' || strategy === 'hybrid-sem-hier'
  const isLate = strategy === 'late-chunking'
  const isSection = strategy === 'sections' || strategy === 'markdown-headers' || strategy === 'hybrid-sec-sem'

  return (
    <div className="chunk-card">
      {/* ── header ── */}
      <div className="chunk-header" onClick={() => setOpen(o => !o)}>
        <span className="chunk-index">#{item.index}</span>

        <span className="badge">{chars} chars</span>
        <span className="badge">{words} words</span>

        {mode === 'embed' && item.embedding_preview && (
          <span className="badge accent">{item.embedding_preview.length === 8 ? `${mode === 'embed' ? '1024' : '?'}d` : ''}</span>
        )}

        {/* strategy-specific badges */}
        {isHierarchical && item.parent_index !== undefined && (
          <span className="badge">parent #{item.parent_index}</span>
        )}
        {strategy === 'semantic' && item.similarity_at_break != null && (
          <span className="badge muted">break sim: {item.similarity_at_break}</span>
        )}
        {strategy === 'hybrid-sem-hier' && item.parent_similarity_at_break != null && (
          <span className="badge muted">parent break sim: {item.parent_similarity_at_break}</span>
        )}
        {strategy === 'hybrid-para-sem' && item.merged_count !== undefined && (
          <span className="badge">⊕ {item.merged_count} para</span>
        )}
        {strategy === 'hybrid-para-sem' && item.avg_similarity != null && (
          <span className="badge muted">avg sim: {item.avg_similarity}</span>
        )}
        {isLate && item.tok_start !== undefined && (
          <span className="badge accent">
            tokens {item.tok_start}–{item.tok_end} / {item.total_doc_tokens}
          </span>
        )}
        {isSection && item.section_title && (
          <span className="badge accent" title="Section title">
            {strategy === 'markdown-headers' && item.heading_level
              ? `${'#'.repeat(item.heading_level)} `
              : '§ '}
            {item.section_title}
          </span>
        )}
        {isContextual && item.context_time_ms != null && (
          <span className="badge muted">⏱ {fmtMs(item.context_time_ms)}</span>
        )}
        {mode === 'embed' && item.embedding_norm != null && (
          <span className="badge muted" style={{ marginLeft: 'auto' }}>
            norm: {item.embedding_norm}
          </span>
        )}

        <span className="collapse-arrow">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <>
          {/* LLM context box (contextual strategies) */}
          {isContextual && item.context && (
            <div className="chunk-context">
              <strong>Context:</strong> {item.context}
            </div>
          )}

          {/* chunk text */}
          <div
            className="chunk-body"
            dangerouslySetInnerHTML={{ __html: escHtml(item.text ?? '') }}
          />

          {/* chunk-only note (late-chunking preview) */}
          {item.note && (
            <div className="chunk-note">{item.note}</div>
          )}

          {/* collapsible parent (hierarchical) */}
          {isHierarchical && item.parent_text && (
            <div className="parent-section">
              <button className="parent-toggle" onClick={e => { e.stopPropagation(); setParentOpen(o => !o) }}>
                {parentOpen ? '▲' : '▼'} Parent chunk
              </button>
              {parentOpen && (
                <div
                  className="chunk-body parent-body"
                  dangerouslySetInnerHTML={{ __html: escHtml(item.parent_text) }}
                />
              )}
            </div>
          )}

          {/* embedding preview */}
          {mode === 'embed' && item.embedding_preview?.length && (
            <div className="embed-section">
              <span className="embed-label">Embedding preview (first 8 dims):</span>
              <div className="embed-bar">
                {item.embedding_preview.map((v, i) => (
                  <span key={i} className="embed-val">{v.toFixed(4)}</span>
                ))}
                <span className="embed-ellipsis">…</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
