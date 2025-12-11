# Exporting Markdown to PDF

This repo is set up so you can work in `.md` files and quickly export any open Markdown file to a PDF that lands in your `~/Downloads` folder.

## One-time setup (CLI tools)

You need two things installed on your Mac:

1. **Pandoc** – does the Markdown → PDF conversion
2. **LaTeX engine (`pdflatex`)** – used by Pandoc to actually build the PDF

Install both via Homebrew:

```bash
# Pandoc
brew install pandoc

# LaTeX (provides pdflatex; large download but simple)
brew install --cask mactex-no-gui
```

After installation, restart VS Code so your shell and PATH are up to date.

## VS Code task configuration

The repo already contains a task in `.vscode/tasks.json`:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Markdown: Export to PDF",
      "type": "shell",
      "command": "pandoc",
      "args": [
        "${file}",
        "-o",
        "$HOME/Downloads/${fileBasenameNoExtension}.pdf"
      ],
      "group": "build",
      "problemMatcher": []
    }
  ]
}
```

What this does:
- Takes the **currently active file** in the editor
- Runs `pandoc` on it
- Writes `~/Downloads/<file-name>.pdf` (overwriting if it exists)

## How to export a PDF

1. Open the Markdown file you want to export (e.g. `world/factions/elderhort/witchs.md`).
2. Press `Cmd+Shift+P` to open the Command Palette.
3. Run: `Tasks: Run Task`.
4. Pick: `Markdown: Export to PDF`.
5. Check `~/Downloads` for `your-file-name.pdf`.

### Optional: bind to the build hotkey

Because the task is in the `build` group, you can also:

1. Press `Cmd+Shift+P` → `Tasks: Run Build Task`.
2. Select `Markdown: Export to PDF` the first time.

From then on, pressing `Cmd+Shift+B` will run the export directly for whatever Markdown file is currently active.

## Troubleshooting

### Error: `pdflatex not found`

If you see something like:

> `pdflatex not found. Please select a different --pdf-engine or install pdflatex`

it means the LaTeX engine is missing. Install it with:

```bash
brew install --cask mactex-no-gui
```

Then restart VS Code and run the task again.

### Alternate PDF engine (optional)

If you don’t want to install full LaTeX, you can instead:

1. Install `wkhtmltopdf`:

   ```bash
   brew install wkhtmltopdf
   ```

2. Update the task in `.vscode/tasks.json` to add a `--pdf-engine` flag:

   ```jsonc
   "args": [
     "${file}",
     "--pdf-engine=wkhtmltopdf",
     "-o",
     "$HOME/Downloads/${fileBasenameNoExtension}.pdf"
   ]
   ```

Pandoc will then use `wkhtmltopdf` instead of `pdflatex` when generating PDFs.
