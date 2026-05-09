#!/usr/bin/env python3
"""Convert markdown to HTML with print-to-PDF styling."""

import argparse
import pathlib
import subprocess
import sys

HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    @page {{
      size: letter;
      margin: 0.4in;
    }}

    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.3;
      color: #333;
    }}

    h1, h2, h3, h4, h5, h6 {{
      margin-top: 0.25em;
      margin-bottom: 0.15em;
      font-weight: 600;
    }}

    h1 {{ font-size: 16pt; margin-top: 0; }}
    h2 {{ font-size: 12pt; }}
    h3 {{ font-size: 10pt; }}
    h4, h5, h6 {{ font-size: 9pt; }}

    p {{
      margin-bottom: 0.2em;
    }}

    ul, ol {{
      margin-left: 1.2em;
      margin-bottom: 0.2em;
      padding: 0;
    }}

    li {{
      margin-bottom: 0.1em;
    }}

    table {{
      border-collapse: collapse;
      width: 100%;
      margin: 0.2em 0;
      font-size: 7.5pt;
    }}

    thead {{
      background: #f5f5f5;
      font-weight: 600;
    }}

    th, td {{
      border: 0.5pt solid #999;
      padding: 0.2em 0.3em;
      text-align: left;
      word-break: break-word;
    }}

    th:last-child, td:last-child {{
      width: 2.5in;
      min-width: 2.5in;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }}

    th {{
      background: #f9f9f9;
      font-weight: 600;
    }}

    tbody tr:nth-child(even) {{
      background: #fafafa;
    }}

    code {{
      font-family: Monaco, Menlo, 'Ubuntu Mono', monospace;
      font-size: 7.5pt;
      background: #f5f5f5;
      padding: 0.05em 0.15em;
    }}

    pre {{
      background: #f5f5f5;
      border: 0.5pt solid #ddd;
      padding: 0.25em;
      border-radius: 2px;
      overflow: auto;
      font-size: 7pt;
      margin: 0.15em 0;
      line-height: 1.2;
    }}

    pre code {{
      background: none;
      padding: 0;
    }}

    hr {{
      border: none;
      border-top: 1px solid #ddd;
      margin: 0.2em 0;
    }}

    strong, b {{
      font-weight: 600;
    }}

    em, i {{
      font-style: italic;
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
    parser = argparse.ArgumentParser(description="Convert markdown to printable HTML")
    parser.add_argument("input_file", help="Markdown file to convert")
    parser.add_argument("--output", "-o", help="Output HTML path (default: ~/Downloads/<name>.html)")
    args = parser.parse_args(argv[1:])

    input_path = pathlib.Path(args.input_file).expanduser()
    if not input_path.exists():
        print(f"Error: {input_path} not found", file=sys.stderr)
        return 1

    # Convert markdown to HTML
    try:
        html_content = markdown_to_html(input_path)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # Generate full HTML document
    title = input_path.stem.replace("-", " ").title()
    html_doc = HTML_TEMPLATE.format(title=title, content=html_content)

    # Determine output path
    if args.output:
        output_path = pathlib.Path(args.output).expanduser()
    else:
        output_path = pathlib.Path.home() / "Downloads" / f"{input_path.stem}.html"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write HTML
    try:
        output_path.write_text(html_doc, encoding="utf-8")
        print(f"HTML file generated: {output_path}")
        print("Open in browser and press Cmd+P to print to PDF")
        return 0
    except Exception as e:
        print(f"Error writing HTML: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
