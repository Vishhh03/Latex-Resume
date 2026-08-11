# typst-resume-cli

Lightning-fast Interactive CLI for the Serverless Typst AI Resume Editor.

```bash
npx typst-resume-cli
```

*(Backwards compatible alias: `npx latex-resume-cli`)*

---

## Technical Overview

`typst-resume-cli` provides an interactive terminal interface and local web server to launch the serverless resume editor, inspect system architecture specs, and edit resume versions with live PDF sync.

### Features
- Direct connection to live AWS Lambda Function URL (< 1s cold start)
- Sub-15ms Typst PDF rendering and real-time live preview sync
- Multi-provider AI Agent (AWS Bedrock, Google Gemini, OpenAI, Anthropic, OpenRouter)
- Architecture inspection and non-interactive server modes

---

## CLI Options & Usage

```bash
USAGE:
  $ npx typst-resume-cli [command] [options]

COMMANDS:
  editor, open, start  Launch the local Web UI Resume Editor directly
  help                 Display help guide

OPTIONS:
  -p, --port <number> Specify local server port (default: random free port)
  --no-open          Start server without automatically opening browser
  -q, --quiet        Suppress ASCII banner output
  -v, --version      Display CLI version number
  -h, --help         Display help guide

ENVIRONMENT VARIABLES:
  RESUME_API_URL     Override target AWS Lambda backend URL
  RESUME_WEB_URL     Override frontend target URL

EXAMPLES:
  $ npx typst-resume-cli
  $ npx typst-resume-cli open --port 3000
  $ npx typst-resume-cli --no-open
  $ RESUME_API_URL=https://your-lambda-url.aws npx typst-resume-cli
```

---

## Architecture Specification

The CLI interfaces with an AWS Lambda serverless execution layer running:
- **Typst Compiler Engine**: Sub-20ms PDF generation
- **Amazon Bedrock Converse API**: JSON Schema-enforced AI modifications
- **GitHub REST API**: Direct commit integration to main branch

---

## License

MIT License
