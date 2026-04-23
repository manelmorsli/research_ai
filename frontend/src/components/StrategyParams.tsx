import type { RunParams } from '../types'
import { OVERLAP_DEFAULTS, STRATEGY_CONFIG } from '../config'

interface Props {
  strategy: string
  params: RunParams
  update: <K extends keyof RunParams>(key: K, val: RunParams[K]) => void
}

export default function StrategyParams({ strategy, params, update }: Props) {
  const cfg = STRATEGY_CONFIG[strategy]
  if (!cfg) return null
  const panels = cfg.panels

  return (
    <>
      {/* ── description pill ── */}
      {cfg.description && (
        <div className="param-note">{cfg.description}</div>
      )}

      {/* ── chunk size ── */}
      {panels.includes('chunk-size') && (
        <div className="param-group">
          <label>Chunk size (chars)</label>
          <input
            type="number" min={50} max={4000}
            value={params.chunkSize}
            onChange={e => update('chunkSize', Number(e.target.value))}
          />
        </div>
      )}

      {/* ── boundary snap ── */}
      {panels.includes('boundary') && (
        <div className="param-group">
          <label>Boundary snap</label>
          <select value={params.snapBoundary} onChange={e => update('snapBoundary', e.target.value)}>
            <option value="none">None — hard cut</option>
            <option value="word">Full word</option>
            <option value="sentence">Full sentence</option>
          </select>
        </div>
      )}

      {/* ── overlap ── */}
      {panels.includes('overlap') && (
        <div className="param-group">
          <label>Overlap type</label>
          <select
            value={params.overlapType}
            onChange={e => {
              const t = e.target.value
              update('overlapType', t)
              update('overlapValue', OVERLAP_DEFAULTS[t] ?? 50)
            }}
          >
            <option value="chars">Characters</option>
            <option value="words">Words</option>
            <option value="sentences">Sentences</option>
          </select>
          <label style={{ marginTop: '0.6rem' }}>Overlap amount</label>
          <input
            type="number" min={0} max={500}
            value={params.overlapValue}
            onChange={e => update('overlapValue', Number(e.target.value))}
          />
        </div>
      )}

      {/* ── semantic ── */}
      {panels.includes('semantic') && (
        <div className="param-group">
          <label>Break percentile (%)</label>
          <input
            type="number" min={50} max={99} step={1}
            value={params.percentileThreshold}
            onChange={e => update('percentileThreshold', Number(e.target.value))}
          />
          <p className="param-hint">Lower = more chunks. 85 → split at the 15% least-similar sentence boundaries.</p>
          <label style={{ marginTop: '0.6rem' }}>Embed model (similarity)</label>
          <select value={params.semanticEmbedModel} onChange={e => update('semanticEmbedModel', e.target.value)}>
            <option value="bge-m3">bge-m3 (Ollama)</option>
          </select>
        </div>
      )}

      {/* ── late-chunk: all late-chunking params in one panel ── */}
      {panels.includes('late-chunk') && (
        <div className="param-group">
          <label>Chunking mode</label>
          <select value={params.lateChunkMode} onChange={e => update('lateChunkMode', e.target.value)}>
            <option value="fixed">Fixed size</option>
            <option value="semantic">Context-aware (auto boundaries)</option>
          </select>

          {params.lateChunkMode === 'fixed' && (
            <>
              <label style={{ marginTop: '0.8rem' }}>Chunk size (chars)</label>
              <input
                type="number" min={50} max={4000}
                value={params.chunkSize}
                onChange={e => update('chunkSize', Number(e.target.value))}
              />

              <label style={{ marginTop: '0.6rem' }}>Overlap type</label>
              <select value={params.overlapType} onChange={e => update('overlapType', e.target.value)}>
                <option value="chars">Characters</option>
                <option value="words">Words</option>
                <option value="sentences">Sentences</option>
              </select>

              <label style={{ marginTop: '0.6rem' }}>Overlap amount</label>
              <input
                type="number" min={0} max={500}
                value={params.overlapValue}
                onChange={e => update('overlapValue', Number(e.target.value))}
              />

              <label style={{ marginTop: '0.6rem' }}>Boundary snap</label>
              <select value={params.snapBoundary} onChange={e => update('snapBoundary', e.target.value)}>
                <option value="none">None — hard cut</option>
                <option value="word">Snap to full word</option>
                <option value="sentence">Snap to full sentence</option>
              </select>
              <p className="param-hint">Extend the chunk end to the nearest word or sentence boundary.</p>
            </>
          )}

          {params.lateChunkMode === 'semantic' && (
            <>
              <label style={{ marginTop: '0.8rem' }}>Split threshold (%)</label>
              <input
                type="number" min={50} max={99} step={1}
                value={params.percentileThreshold}
                onChange={e => update('percentileThreshold', Number(e.target.value))}
              />
              <p className="param-hint">
                Split where cosine similarity between adjacent sentences &lt; threshold ÷ 100.
                87 → split below 0.87. Higher = more chunks, finer boundaries.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── hierarchical ── */}
      {panels.includes('hierarchical') && (
        <div className="param-group">
          <label>Parent size (chars)</label>
          <input type="number" min={200} max={8000} value={params.parentChunkSize}
            onChange={e => update('parentChunkSize', Number(e.target.value))} />
          <label style={{ marginTop: '0.6rem' }}>Child size (chars)</label>
          <input type="number" min={50} max={1000} value={params.childChunkSize}
            onChange={e => update('childChunkSize', Number(e.target.value))} />
          <label style={{ marginTop: '0.6rem' }}>Child overlap (chars)</label>
          <input type="number" min={0} max={200} value={params.childChunkOverlap}
            onChange={e => update('childChunkOverlap', Number(e.target.value))} />
        </div>
      )}

      {/* ── llm model ── */}
      {panels.includes('llm') && (
        <div className="param-group">
          <label>LLM model</label>
          <select value={params.llmModel} onChange={e => update('llmModel', e.target.value)}>
            <option value="qwen2.5:1.5b">qwen2.5:1.5b (Ollama)</option>
          </select>
          <p className="param-hint">Generates 1–2 sentences of context per chunk. Slow on large docs.</p>
        </div>
      )}

      {/* ── hybrid-sem-hier child params ── */}
      {panels.includes('hybrid-child') && (
        <div className="param-group">
          <label>Child size (chars)</label>
          <input type="number" min={50} max={1000} value={params.hybridChildSize}
            onChange={e => update('hybridChildSize', Number(e.target.value))} />
          <label style={{ marginTop: '0.6rem' }}>Child overlap (chars)</label>
          <input type="number" min={0} max={200} value={params.hybridChildOverlap}
            onChange={e => update('hybridChildOverlap', Number(e.target.value))} />
        </div>
      )}

      {/* ── hybrid-para-sem ── */}
      {panels.includes('para-sem') && (
        <div className="param-group">
          <label>Merge similarity threshold</label>
          <input type="number" min={0.5} max={0.99} step={0.01} value={params.similarityThreshold}
            onChange={e => update('similarityThreshold', Number(e.target.value))} />
          <p className="param-hint">Merge adjacent paragraphs if similarity ≥ this value.</p>
          <label style={{ marginTop: '0.6rem' }}>Max merged size (chars)</label>
          <input type="number" min={200} max={8000} value={params.maxMergedSize}
            onChange={e => update('maxMergedSize', Number(e.target.value))} />
          <label style={{ marginTop: '0.6rem' }}>Embed model</label>
          <select value={params.paraSemEmbedModel} onChange={e => update('paraSemEmbedModel', e.target.value)}>
            <option value="bge-m3">bge-m3 (Ollama)</option>
          </select>
        </div>
      )}

      {/* ── section / markdown-headers ── */}
      {panels.includes('section') && (
        <div className="param-group">
          <label>Min section size (chars)</label>
          <input
            type="number" min={0} max={2000}
            value={params.minSectionSize}
            onChange={e => update('minSectionSize', Number(e.target.value))}
          />
          <p className="param-hint">Sections shorter than this are merged into the previous one.</p>
        </div>
      )}
    </>
  )
}
