# Research AI — Chunking & Embedding Strategies Testing Report

**Date:** 2026-04-16  
**Lab:** `localhost:8080`  
**Backend:** FastAPI `localhost:8001`  
**Test document:** _(specify your test file name here)_

---

## Environment

| Component | Value |
|---|---|
| Embedding models (Ollama) | `bge-m3`, `nomic-embed-text` |
| LLM model (Ollama) | `qwen2.5:1.5b` |
| HuggingFace model | `jinaai/jina-embeddings-v3` (late chunking) |
| Backend | FastAPI + Uvicorn on port 8001 |
| Frontend | React + Vite on port 8080 |

---

## How to Read This Report

Each strategy section contains:
- **Description** — what the strategy does
- **Parameters tested** — values used during the test
- **Expected behavior** — what correct output looks like
- **Screenshot** — placeholder for your capture
- **Observations** — fill in after testing
- **Pass / Fail** — your verdict

---

---

# CLASSIC STRATEGIES

---

## 1. Fixed Size

**Description:**  
Splits text into chunks of exactly N characters. Overlap can be by characters, words, or sentences. Boundary snapping extends the cut to the nearest full word or sentence.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Chunk size | 500 chars |
| Overlap type | chars |
| Overlap amount | 50 |
| Boundary snap | None |

**Expected behavior:**
- All chunks are approximately 500 characters
- The last 50 characters of chunk N appear at the start of chunk N+1
- Total chunks ≈ `text_length / (chunk_size - overlap)`

**Screenshot:**

![Fixed size — default params](screenshots/01_fixed_default.png)

**Test — boundary snap: Full word:**

| Parameter | Value |
|---|---|
| Chunk size | 500 |
| Boundary snap | Full word |

Expected: chunks end at a word boundary, no mid-word cuts.

![Fixed size — word boundary snap](screenshots/01_fixed_word_snap.png)

**Test — boundary snap: Full sentence:**

Expected: chunks end at `.`, `!`, or `?`.

![Fixed size — sentence boundary snap](screenshots/01_fixed_sentence_snap.png)

**Test — overlap type: Words (3 words):**

Expected: the last 3 words of chunk N are the first 3 words of chunk N+1.

![Fixed size — word overlap](screenshots/01_fixed_word_overlap.png)

**Test — overlap type: Sentence (1 sentence):**

Expected: the last sentence of chunk N are the first sentence of chunk N+1.

![Fixed size — word overlap](screenshots/01_fixed_sentence_overlap.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; [x]ail &nbsp;&nbsp; ☐ Partial

---

## 2. Sentence

**Description:**  
Splits text at sentence boundaries (`.`, `!`, `?`), then merges sentences into chunks until `chunk_size` is reached. Overlap is expressed in number of sentences.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Chunk size | 500 chars |
| Overlap type | sentences |
| Overlap amount | 1 |

**Expected behavior:**
- Every chunk boundary falls at the end of a complete sentence
- No sentence is split mid-way
- 1-sentence overlap: last sentence of chunk N is first sentence of chunk N+1

**Screenshot:**

![Sentence chunking — default](screenshots/02_sentence_default.png)

**Test — overlap: 5 words:**

![Sentence chunking — 5 words overlap](screenshots/02_sentence_words_overlap.png)

**Observations:**  
_The Sentence strategy assumes that meaningful boundaries are marked by terminal punctuation (., !, ?). On PDF-extracted text, structured sections such as headers, metadata blocks, author information, URLs, and dates appear as raw lines with no sentence-ending punctuation. Each line is treated as a standalone "sentence" and the strategy groups them together into a single mixed chunk — producing noisy, semantically incoherent output that mixes unrelated fields (journal name, DOI, affiliation, dates) in one vector.
Verdict: Not recommended for PDFs or any document where structure is conveyed by line breaks rather than punctuation. Prefer Paragraph (respects \n\n block boundaries) or Recursive (tries multiple separators in order) for this type of content._

**Result:** ☐ Pass &nbsp;&nbsp; [x] Fail &nbsp;&nbsp; ☐ Partial

---

## 3. Paragraph

**Description:**  
Splits on double newlines (`\n\n`). Each natural paragraph becomes a chunk. Overlap prepends the tail of the previous paragraph.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Overlap type | chars |
| Overlap amount | 50 |

> Note: chunk size is **not applicable** — boundaries are defined by the document structure.
> Note 02: we can always apply chunk size as a parameter — chunk size with a maximum caracters.

**Expected behavior:**
- Number of chunks = number of natural paragraphs in the document
- Each chunk corresponds to one pageof the pdf (plus optional overlap prefix)
- Works best on well-structured documents (articles, reports, books)

**Screenshot:**

![Paragraph chunking](screenshots/03_paragraph_default.png)

**Screenshot of the PDF pages:**
![Paragraph chunking original PDF](screenshots/03_paragraph_default_pdf.png)

**Test — overlap: 1 sentence:**

Expected: One sentence is overlapped 

![Paragraph chunking — no overlap](screenshots/03_paragraph_sentence.png)

**Test — overlap witth embeddings **

Expected: Embedding will take too much time 

![Paragraph chunking — with Embeddiing ](screenshots/03_paragraph_embedd.png)


**Observations:**  
_Embedding time is the main bottleneck in embed mode:
Running any strategy in Chunks + Embeddings mode reveals that the embedding step dominates total processing time. With Ollama's bge-m3, each chunk is embedded in a separate sequential HTTP call to the Ollama container — meaning a document producing 60 chunks takes ~60 individual requests. On a local setup this results in several seconds to minutes of wait time depending on chunk count and model size, while the chunking itself completes in milliseconds.

Verdict: Sequential per-chunk embedding is the current architecture's main performance limitation. Batching all chunks into a single Ollama request would reduce this significantly. For production use, a dedicated embedding server with true batch support (e.g. text-embeddings-inference) is recommended over per-call Ollama requests._

**Result:** ☐ Pass &nbsp;&nbsp; [x] Fail &nbsp;&nbsp; ☐ Partial

---

## 4. Recursive

**Description:**  
Tries to split on `\n\n`, then `\n`, then `. `, then ` `, then characters — always keeping chunks under `chunk_size`. Falls back to finer separators when a segment is still too large.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Chunk size | 500 |
| Overlap type | chars |
| Overlap amount | 50 |
| Boundary snap | None |

**Expected behavior:**
- All chunks ≤ chunk_size
- Split points respect document structure when possible (prefers paragraph > sentence > word > char)
- Similar to LangChain's `RecursiveCharacterTextSplitter`

**Screenshot:**

![Recursive chunking — default](screenshots/04_recursive_default.png)

**Test — chunk size (1000) + sentence boundary snap:**

Expected: many small chunks, each ending at a sentence.

![Recursive chunking — small + sentence snap](screenshots/04_recursive_small_sentence.png)

**Test — word overlap (3 words):**

![Recursive chunking — word overlap](screenshots/04_recursive_word_overlap.png)

**Observations:**  
_Recursive is only appropriate for clean, consistently structured prose where \n\n and .  separators are meaningful. For PDFs extracted with standard tools, it should be avoided entirely in favor of Semantic (topic-coherent) or Hierarchical (controlled granularity) strategies. Running it in embed mode would compound the failure — small garbage chunks consume just as much embedding time as meaningful ones, with no retrieval value returned._

**Result:** ☐ Pass &nbsp;&nbsp; [x] Fail &nbsp;&nbsp; ☐ Partial

---

---

# ADVANCED STRATEGIES

---

## 5. Semantic (Similarity-Based)

**Description:**  
Splits text into sentences, embeds each sentence using an Ollama model, computes cosine similarity between consecutive sentences, and places a chunk boundary wherever similarity drops below the N-th percentile threshold.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Break percentile | 85% |
| Embed model | bge-m3 (Ollama) |

**Expected behavior:**
- Chunks group semantically related sentences together
- Topic shifts produce chunk boundaries
- The `break sim` badge on each card shows the cosine similarity at that break point
- Lower percentile → fewer, larger chunks; higher percentile → more, smaller chunks

**Screenshot:**

![Semantic chunking — 85th percentile](screenshots/z.png)

**Test — percentile: 70 (fewer chunks):**

Expected: larger chunks grouping more sentences.

![Semantic chunking — 70th percentile](screenshots/05_semantic_70.png)

**Test — percentile: 95 (many chunks):**

Expected: very fine-grained splits at any slight topic change.

![Semantic chunking — 95th percentile](screenshots/05_semantic_95.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 6. Hierarchical Parent-Child

**Description:**  
Creates two levels of chunks: large parent chunks (for context) and small child chunks (for retrieval). Each child chunk stores a reference to its parent. Used in parent-document retrieval patterns.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Parent size | 1024 chars |
| Child size | 256 chars |
| Child overlap | 50 chars |

**Expected behavior:**
- Cards show `parent #N` badge indicating which parent the child belongs to
- Multiple children per parent (≈ 1024/256 = 4)
- Collapsible "Parent chunk" section visible in each card
- Child overlap creates continuity between adjacent children of the same parent

**Screenshot:**

![Hierarchical — default params](screenshots/06_hierarchical_default.png)

**Test — large parent (2048) + small child (128):**

Expected: more children per parent, finer granularity.

![Hierarchical — 2048/128](screenshots/06_hierarchical_large_parent.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 7. Contextual (Anthropic 2024)

**Description:**  
Each paragraph chunk is enriched with 1–2 sentences of LLM-generated context that situates the chunk within the full document. Based on the Anthropic contextual retrieval paper (2024). Significantly improves retrieval accuracy at the cost of LLM inference time.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Overlap type | chars |
| Overlap amount | 50 |
| LLM model | qwen2.5:1.5b (Ollama) |

**Expected behavior:**
- Each card shows a yellow **Context:** box above the chunk text
- Context is 1–2 sentences describing where this chunk fits in the document
- The `⏱` badge on each card shows how long the LLM took per chunk
- Total time is significantly longer than other strategies (LLM inference per chunk)

**Screenshot:**

![Contextual chunking — with context boxes](screenshots/07_contextual_default.png)

**Screenshot — timing comparison:**

![Contextual chunking — timing](screenshots/07_contextual_timing.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 8. Late Chunking — jina-embeddings-v3 (HuggingFace)


**Description:**  
The full document is tokenized and passed through `jina-embeddings-v3` (8192-token context window) in a single forward pass. Token-level hidden states are then mean-pooled for each fixed-size chunk boundary. Unlike standard embedding (each chunk encoded in isolation), every embedding carries full-document context.

> **Requires:** Model downloaded via Settings → Download model (~2 GB)  
> **Mode:** Embed mode only (chunk-only mode shows boundaries without the contextual benefit)

**Parameters tested:**

| Parameter | Value |
|---|---|
| Chunk size | 500 chars |
| Overlap | 50 chars |
| Embed model | jina-embeddings-v3 (HuggingFace) |

**Expected behavior:**
- Toolbar shows: `🤗 jina-embeddings-v3`, dim: **1024**
- Each card shows token range badge: `tokens 12–48 / 312` (start token, end token, total doc tokens)
- `total_doc_tokens` is the same for all chunks (full document was processed once)
- Embedding preview shows 8 of the 1024 dimensions
- Processing time is longer (full model forward pass on entire document)

**Screenshot — chunk-only mode (boundary preview):**

![Late chunking — chunk-only mode](screenshots/08_late_chunk_only.png)

**Screenshot — embed mode (contextual embeddings):**

![Late chunking — embed mode](screenshots/08_late_embed_mode.png)

**Screenshot — Settings drawer (model status):**

![Late chunking — settings model download](screenshots/08_late_settings.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 9. Markdown Headers

**Description:**  
Splits on Markdown heading markers (`#`, `##`, `###`). Each section between headings becomes one chunk. Best suited for `.md` files or documents exported with Markdown structure.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Min section size | 100 chars |

**Expected behavior:**
- Each chunk corresponds to one Markdown section
- Chunk text begins with the heading line
- Deeply nested sections (`###`) are split from their parent (`##`)
- Short sections below `min_section_size` are merged with the next section

**Screenshot:**

![Markdown headers — default](screenshots/09_markdown_headers_default.png)

**Test — large min section size (500 chars, more merging):**

Expected: short sections get merged into larger chunks.

![Markdown headers — large min section](screenshots/09_markdown_headers_large_min.png)

**Observations:**  
_This is a good strategy for structured Markdown files, and it would work well for scraped data from websites — but it requires data preprocessing (cleaning and filtering) before chunking and embedding, such as removing duplicates and irrelevant content._

**Result:** [x] Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 10. Section-Based (PDF / Plain Text)

**Description:**  
Detects structural headings in plain text and PDFs: numbered headings (`1.`, `2.1`), Roman numerals (`I.`, `II.`), ALL CAPS titles, and academic keywords (`Abstract`, `Introduction`, `Conclusion`, etc.). Each detected section becomes one chunk.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Min section size | 50 chars |

**Expected behavior:**
- Chunks align with logical document sections and subsections (1.  /  1.1  /  1.1.1)
- `section_title` badge on each card shows the detected heading title
- Deep subsections (`3.2.1`, `3.2.2`, `3.3`…) each produce their own chunk
- Works with both Plain text and Markdown parser (after fix)

**Test — PDF parser: Markdown, document A:**

Result: only **2 chunks** — entire document collapsed into one large block, no section boundaries detected.

![Section-based — Markdown parser, document A](screenshots/10_sections_markdown_PDF.png)

**Test — PDF parser: Markdown, document B (deep subsections):**

Result: **49 chunks** — `Chapter 2`, `2.1`, `2.1.1`, `2.2`, `2.2.1`, `2.2.2` all detected correctly.

![Section-based — Markdown parser, document B](screenshots/10_sections_markdown_subsection.png)

**Test — PDF parser: Plain text, document B:**

Result: **49 chunks** — full subsection hierarchy detected: `3.2.1 Quantitative Surveys`, `3.2.2 Qualitative Interviews`, `3.3 Participant Selection`, `3.4.1 Quantitative Analysis`…

![Section-based — Plain text parser, document A](screenshots/10_sections_plaintext.png)

**Observations:**  
_Results vary depending on the PDF and the parser used. The Plain text parser works reliably for documents with numbered sections. The Markdown parser can produce very detailed splits on some PDFs (document B: 49 chunks with deep subsections) but may collapse the entire document on others. The min_section_size parameter controls whether short subsections get their own chunk or are merged into the next one._

**Result:** [x] Pass — works correctly with both parsers after the backend fix

---

---

# HYBRID STRATEGIES

---

## 11. Semantic → Hierarchical

**Description:**  
First applies semantic chunking to create context-aware parent chunks (topic-based boundaries). Then applies fixed-size splitting on each parent to create child chunks. Combines semantic coherence at the parent level with uniform granularity at the child level.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Break percentile | 85% |
| Embed model | bge-m3 |
| Child size | 256 chars |
| Child overlap | 50 chars |

**Expected behavior:**
- Cards show `parent #N` badge and `parent break sim` badge
- Parent boundaries are semantically meaningful (topic shifts)
- Children within the same parent are semantically related
- Collapsible parent text visible in each card

**Screenshot:**

![Hybrid Semantic→Hierarchical](screenshots/09_hybrid_sem_hier.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 12. Recursive → Contextual

**Description:**  
Applies recursive splitting (structure-aware), then enriches each chunk with LLM-generated context (same as Contextual strategy). Combines the precision of recursive splitting with the retrieval improvement of contextual enrichment.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Chunk size | 500 chars |
| Overlap type | chars |
| Overlap amount | 50 |
| Boundary snap | None |
| LLM model | qwen2.5:1.5b |

**Expected behavior:**
- Same yellow context boxes as the Contextual strategy
- `⏱` badge per chunk (LLM time)
- Chunk boundaries follow document structure (not just fixed chars)
- Slower than recursive alone due to LLM calls

**Screenshot:**

![Hybrid Recursive→Contextual](screenshots/10_hybrid_rec_ctx.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

## 13. Paragraph → Semantic Merge

**Description:**  
Starts with natural paragraph splits, then merges adjacent paragraphs if their cosine similarity exceeds the threshold AND the merged size stays under `max_merged_size`. Creates semantically coherent chunks that respect document structure.

**Parameters tested:**

| Parameter | Value |
|---|---|
| Merge similarity threshold | 0.85 |
| Max merged size | 1500 chars |
| Embed model | bge-m3 |

**Expected behavior:**
- Cards show `⊕ N para` badge (how many paragraphs were merged)
- Cards show `avg sim` badge (average similarity of merged paragraphs)
- Chunks with `merged_count: 1` = standalone paragraph (no similar neighbor found)
- Chunks with `merged_count: 3+` = several related paragraphs grouped

**Screenshot — default threshold (0.85):**

![Hybrid Paragraph→Semantic merge — 0.85](screenshots/11_hybrid_para_sem_085.png)

**Test — high threshold (0.95, less merging):**

Expected: fewer merges, more standalone paragraphs.

![Hybrid Paragraph→Semantic merge — 0.95](screenshots/11_hybrid_para_sem_095.png)

**Test — low threshold (0.70, aggressive merging):**

Expected: larger chunks, many paragraphs merged together.

![Hybrid Paragraph→Semantic merge — 0.70](screenshots/11_hybrid_para_sem_070.png)

**Observations:**  
_Add your notes here after testing._

**Result:** ☐ Pass &nbsp;&nbsp; ☐ Fail &nbsp;&nbsp; ☐ Partial

---

---

# EMBED MODE — CROSS-STRATEGY COMPARISON

Run each strategy in **Chunks + Embeddings** mode and compare.

| Strategy | Total chunks | Embedding dim | Chunk time | Embed time | Notes |
|---|---|---|---|---|---|
| Fixed | | | | | |
| Sentence | | | | | |
| Paragraph | | | | | |
| Recursive | | | | | |
| Semantic | | | | | |
| Hierarchical | | | | | |
| Contextual | | | | | |
| Markdown headers | | | | | |
| Section-based | | | | | |
| Hybrid sem→hier | | | | | |
| Hybrid rec→ctx | | | | | |
| Hybrid para→sem | | | | | |
| Late Chunking | | 1024 | | — | Single forward pass |

**Screenshot — embed mode toolbar comparison:**

![Embed mode comparison](screenshots/embed_comparison.png)

---

---

# EDGE CASES

## Short document (< 200 chars)

Test all strategies on a very short text. Expected: 1–2 chunks max, no crash.

![Edge case — short document](screenshots/edge_short_doc.png)

---

## Single paragraph document

Test paragraph and semantic strategies. Expected: single chunk returned.

![Edge case — single paragraph](screenshots/edge_single_para.png)

---

## Large document (> 50 pages PDF)

Test fixed and recursive. Expected: many chunks, no timeout (check backend logs).

![Edge case — large PDF](screenshots/edge_large_pdf.png)

---

## Re-running without page reload

Upload a file, run one strategy, then change strategy and run again without reloading.  
Expected: results update correctly, no stale data shown.

![Re-run test](screenshots/edge_rerun.png)

---

## Raw JSON view

Switch to Raw JSON after any run. Expected: full JSON response displayed correctly.

![Raw JSON view](screenshots/edge_raw_json.png)

---

---

# SUMMARY

| # | Strategy | Mode | Status | Notes |
|---|---|---|---|---|
| 1 | Fixed size | Chunk + Embed | | |
| 2 | Sentence | Chunk + Embed | | |
| 3 | Paragraph | Chunk + Embed | | |
| 4 | Recursive | Chunk + Embed | | |
| 5 | Semantic | Chunk + Embed | | |
| 6 | Hierarchical | Chunk + Embed | | |
| 7 | Contextual | Chunk + Embed | | |
| 8 | Late Chunking | Embed only | | Requires model download |
| 9 | Markdown headers | Chunk + Embed | | Best for .md files |
| 10 | Section-based | Chunk + Embed | Pass | Both parsers ✅ after backend fix — 49 chunks on deep subsection PDF |
| 11 | Hybrid sem→hier | Chunk + Embed | | |
| 12 | Hybrid rec→ctx | Chunk + Embed | | |
| 13 | Hybrid para→sem | Chunk + Embed | | |

---

## General Observations

_Fill in after all tests are complete._

---

## Issues Found

| # | Strategy | Description | Severity |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

---

*Report generated for Research AI Lab — research_ai/backend + research_ai/frontend*
