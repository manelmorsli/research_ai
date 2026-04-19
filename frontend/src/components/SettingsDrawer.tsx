import { useEffect, useState } from 'react'
import { getModelStatus, downloadModel } from '../api'
import type { ModelStatus } from '../types'

interface Props {
  onClose: () => void
}

const OLLAMA_MODELS = [
  { name: 'bge-m3', type: 'Embedding', dims: '1024', context: '8192 tokens', note: 'Primary embedding model' },
  { name: 'nomic-embed-text', type: 'Embedding', dims: '768', context: '2048 tokens', note: 'Alternative embedding model' },
  { name: 'qwen2.5:1.5b', type: 'LLM', dims: '—', context: '32k tokens', note: 'Used for contextual chunking' },
]

export default function SettingsDrawer({ onClose }: Props) {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const fetchStatus = async () => {
    try {
      const s = await getModelStatus()
      setStatus(s)
      return s
    } catch {
      return null
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  // Poll while downloading
  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      const s = await fetchStatus()
      if (s && s.state !== 'downloading') {
        setPolling(false)
        clearInterval(id)
      }
    }, 3000)
    return () => clearInterval(id)
  }, [polling])

  const handleDownload = async () => {
    setActionMsg('')
    const res = await downloadModel()
    setActionMsg(res.message)
    if (res.ok) {
      setPolling(true)
      fetchStatus()
    }
  }

  const stateColor = (s: ModelStatus) => {
    if (s.downloaded || s.state === 'ready') return 'status-ready'
    if (s.state === 'downloading') return 'status-loading'
    if (s.state === 'error') return 'status-error'
    return 'status-idle'
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>Settings &amp; Models</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Ollama models section ── */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge ollama">🦙 Ollama</span>
            Models — available via the Ollama container
          </h3>
          <p className="drawer-hint">
            These models are served by the <code>ollama</code> container and are already downloaded
            into the <code>ollama_data</code> volume.
          </p>
          <table className="model-table">
            <thead>
              <tr><th>Model</th><th>Type</th><th>Dims</th><th>Context</th><th>Used for</th></tr>
            </thead>
            <tbody>
              {OLLAMA_MODELS.map(m => (
                <tr key={m.name}>
                  <td><code>{m.name}</code></td>
                  <td>{m.type}</td>
                  <td>{m.dims}</td>
                  <td>{m.context}</td>
                  <td className="model-note">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── HuggingFace model section ── */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge hf">🤗 HuggingFace</span>
            jinaai/jina-embeddings-v3 — for Late Chunking
          </h3>
          <p className="drawer-hint">
            Required for the <strong>Late Chunking</strong> strategy. The model runs locally in the
            backend container (no API key needed).
          </p>

          {status && (
            <div className="model-card">
              <div className="model-card-row">
                <span className={`status-dot ${stateColor(status)}`} />
                <strong>{status.model_id}</strong>
                <span className="model-card-meta">
                  {status.dims}d · {status.context_tokens} tokens · ~{status.size_gb} GB
                </span>
              </div>
              <p className="model-msg">{status.message}</p>
              {status.state === 'downloading' && (
                <div className="progress-bar">
                  <div className="progress-bar-inner" />
                </div>
              )}
              {!status.downloaded && status.state !== 'downloading' && (
                <button className="download-btn" onClick={handleDownload}>
                  Download from HuggingFace Hub
                </button>
              )}
              {status.downloaded && (
                <div className="ready-badge">Model ready — Late Chunking enabled</div>
              )}
              {actionMsg && <p className="action-msg">{actionMsg}</p>}
            </div>
          )}
        </section>

        {/* ── info ── */}
        <section className="drawer-section">
          <h3>How late chunking works</h3>
          <ol className="how-list">
            <li>The full document is tokenized and passed through jina-embeddings-v3 (8192-token context window).</li>
            <li>Token-level hidden states are computed — each token "sees" the entire document.</li>
            <li>Fixed chunk boundaries are defined on the raw text.</li>
            <li>Token embeddings within each chunk boundary are mean-pooled into one vector per chunk.</li>
          </ol>
          <p className="drawer-hint" style={{ marginTop: '0.5rem' }}>
            Compared to regular embedding (where each chunk is encoded in isolation), late chunking
            preserves cross-chunk context in every vector — reducing the "information island" problem.
          </p>
        </section>
      </div>
    </div>
  )
}
