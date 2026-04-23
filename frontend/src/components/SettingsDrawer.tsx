import { useEffect, useState } from 'react'
import { getModelStatus } from '../api'
import type { ModelStatus } from '../types'

interface Props {
  onClose: () => void
}

const OLLAMA_MODELS = [
  { name: 'bge-m3', type: 'Embedding', dims: '1024', context: '8192 tokens', note: 'Primary embedding model' },
  { name: 'qwen2.5:1.5b', type: 'LLM', dims: '—', context: '32k tokens', note: 'Used for contextual chunking' },
]

const DOWNLOAD_CMD = 'docker compose run --rm -e HF_TOKEN=hf_your_token model-downloader'

export default function SettingsDrawer({ onClose }: Props) {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const [copied, setCopied] = useState(false)

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

  // Poll every 4 s while the user has the drawer open and model isn't ready yet
  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      const s = await fetchStatus()
      if (s?.downloaded) {
        setPolling(false)
        clearInterval(id)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [polling])

  const handleCopy = () => {
    navigator.clipboard.writeText(DOWNLOAD_CMD).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      // Start polling so the drawer auto-updates when the download finishes
      setPolling(true)
    })
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
            backend container (no API key needed after download).
          </p>

          {status && (
            <div className="model-card">
              <div className="model-card-row">
                <span className={`status-dot ${status.downloaded ? 'status-ready' : 'status-idle'}`} />
                <strong>{status.model_id}</strong>
                <span className="model-card-meta">
                  {status.dims}d · {status.context_tokens} tokens · ~{status.size_gb} GB
                </span>
              </div>

              {status.downloaded ? (
                <div className="ready-badge">Available — Late Chunking enabled</div>
              ) : (
                <div className="download-cmd-block">
                  <p className="download-cmd-hint">
                    Run this command in your terminal to download the model (~2 GB):
                  </p>
                  <div className="download-cmd-row">
                    <code className="download-cmd-code">{DOWNLOAD_CMD}</code>
                    <button className="copy-cmd-btn" onClick={handleCopy}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="download-cmd-hint" style={{ marginTop: '0.4rem' }}>
                    Replace <code>hf_your_token</code> with your{' '}
                    <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                      HuggingFace token
                    </a>. The drawer will update automatically when the download completes.
                  </p>
                </div>
              )}
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
