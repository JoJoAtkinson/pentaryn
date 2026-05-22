#!/usr/bin/env python3
"""Convert markdown to HTML-based PDF with custom styling."""

import argparse
import pathlib
import subprocess
import sys
from weasyprint import HTML, CSS

HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      color: #333;
      padding: 0.4in;
    }}

    h1, h2, h3, h4, h5, h6 {{
      margin-top: 0.3em;
      margin-bottom: 0.2em;
      font-weight: 600;
    }}

    h1 {{ font-size: 18pt; margin-top: 0; }}
    h2 {{ font-size: 13pt; }}
    h3 {{ font-size: 11pt; }}
    h4 {{ font-size: 10pt; }}
    h5, h6 {{ font-size: 9pt; }}

    p {{
      margin-bottom: 0.3em;
    }}

    ul, ol {{
      margin-left: 1.2em;
      margin-bottom: 0.3em;
    }}

    li {{
      margin-bottom: 0.15em;
    }}

    table {{
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 0.4em;
      font-size: 8pt;
    }}

    thead {{
      background: #f5f5f5;
      font-weight: 600;
    }}

    th, td {{
      border: 1px solid #ddd;
      padding: 0.25em 0.35em;
      text-align: left;
      word-break: break-word;
    }}

    th {{
      background: #f9f9f9;
      font-weight: 600;
    }}

    tr:nth-child(even) {{
      background: #fafafa;
    }}

    code {{
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 8pt;
      background: #f5f5f5;
      padding: 0.1em 0.2em;
      border-radius: 2px;
    }}

    pre {{
      background: #f5f5f5;
      padding: 0.4em;
      border-radius: 3px;
      overflow: auto;
      font-size: 7.5pt;
      margin-bottom: 0.3em;
    }}

    pre code {{
      background: none;
      padding: 0;
    }}

    hr {{
      border: none;
      border-top: 1px solid #ddd;
      margin: 0.3em 0;
    }}
  </style>
</head>
<body>
  {content}
</body>
</html>
"""

def markdown_to_html(md_file: pathlib.Path) -> str:
    """Convert markdown to HTML using pandoc."""
    cmd = ["pandoc", "-f", "markdown", "-t", "html5", str(md_file)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Pandoc failed: {result.stderr}")
    return result.stdout

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Convert markdown to HTML PDF")
    parser.add_argument("input_file", help="Markdown file to convert")
    parser.add_argument("--output", "-o", help="Output PDF path (default: ~/Downloads/<name>.pdf)")
    args = parser.parse_args(argv[1:])

    input_path = pathlib.Path(args.input_file).expanduser()
    if not input_path.exists():
        print(f"Error: {input_path} not found", file=sys.stderr)
        return 1

    # Convert markdown to HTML
    html_content = markdown_to_html(input_path)

    # Generate full HTML document
    title = input_path.stem.replace("-", " ").title()
    html_doc = HTML_TEMPLATE.format(title=title, content=html_content)

    # Determine output path
    if args.output:
        output_path = pathlib.Path(args.output).expanduser()
    else:
        output_path = pathlib.Path.home() / "Downloads" / f"{input_path.stem}.pdf"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Generate PDF
    try:
        HTML(string=html_doc).write_pdf(str(output_path))
        print(f"PDF exported: {output_path}")
        return 0
    except Exception as e:
        print(f"Error generating PDF: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
