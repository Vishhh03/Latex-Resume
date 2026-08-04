# typst-resume-cli

Interactive terminal for the Serverless Typst AI Resume Editor.

```bash
npx typst-resume-cli
```
*(Also available via `npx latex-resume-cli`)*

## What it does

An interactive CLI interface that lets you:
- ⚡ **Launch the Serverless Typst Resume Editor** (< 1s cold start)
- 📖 **Inspect the System Architecture** (Serverless Typst + Bedrock Converse API)
- 📂 **Explore the GitHub Repository**

## Architecture

This CLI interfaces with a fast AWS Lambda backend running:
- **Typst Engine**: Sub-20ms PDF compilation
- **Amazon Bedrock Converse API**: Structured JSON resume editing with JSON Schema guarantees
- **S3 & GitHub API**: Draft persistence and instant auto-commits

## License

MIT
