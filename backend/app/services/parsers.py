import io
from pathlib import Path


def parse_file(content: bytes, filename: str, pdf_mode: str = "text") -> str:
    """
    pdf_mode: "text"     — plain text via pymupdf (default)
              "markdown" — structured Markdown via pymupdf4llm (preserves headings/tables)
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        if pdf_mode == "markdown":
            return _parse_pdf_markdown(content)
        return _parse_pdf(content)
    elif ext in (".txt", ".md", ".markdown"):
        return content.decode("utf-8", errors="ignore")
    elif ext in (".html", ".htm"):
        return _parse_html(content)
    else:
        # fallback: try plain text
        return content.decode("utf-8", errors="ignore")


def _parse_pdf(content: bytes) -> str:
    import pymupdf

    doc = pymupdf.open(stream=content, filetype="pdf")
    return "\n\n".join(page.get_text() for page in doc)


def _parse_pdf_markdown(content: bytes) -> str:
    """Convert PDF to Markdown preserving heading hierarchy, bold, tables, lists."""
    import pymupdf4llm
    import pymupdf

    doc = pymupdf.open(stream=content, filetype="pdf")
    return pymupdf4llm.to_markdown(doc)


def _parse_html(content: bytes) -> str:
    from selectolax.parser import HTMLParser

    tree = HTMLParser(content.decode("utf-8", errors="ignore"))
    # remove script/style
    for tag in tree.css("script, style"):
        tag.decompose()
    return tree.body.text(separator="\n") if tree.body else ""
