# typst-resume-cli

Interactive CLI for the Serverless Typst AI Resume Editor.

```bash
npx typst-resume-cli
```

*(Backwards compatible alias: `npx latex-resume-cli`)*

---

## Technical Overview

`typst-resume-cli` provides an interactive terminal interface to launch the serverless resume editor, inspect system architecture specs, and manage remote resume data.

### Features
- Direct connection to live AWS Lambda Function URL (< 1s cold start)
- Sub-second resume rendering and preview
- Architecture and schema inspection commands

---

## Architecture Specification

The CLI interfaces with an AWS Lambda serverless execution layer running:
- **Typst Compiler Engine**: Sub-20ms PDF generation
- **Amazon Bedrock Converse API**: JSON Schema-enforced AI modifications
- **GitHub REST API**: Direct commit integration to main branch

---

## License

MIT License
