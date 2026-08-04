# Local Development Setup

This guide explains how to run and test the Serverless Typst Resume Architect locally.

## Prerequisites

- [Python 3.11+](https://www.python.org/) installed.
- [Typst CLI](https://typst.app/) installed (`winget install Typst.Typst` on Windows or `brew install typst` on macOS).

## Quick Start

1. **Install Dependencies**
   ```bash
   cd lambda_src
   pip install -r requirements.txt
   ```

2. **Test Typst Template Compilation**
   To test rendering `resume.json` to `resume.pdf` locally:
   ```bash
   typst compile --root .. template.typ resume.pdf
   ```

3. **Run Lambda Handler Locally**
   You can invoke `lambda_src/handler.py` locally using Python or AWS SAM CLI:
   ```bash
   python -c "import lambda_src.handler as h; print(h.handler({'rawPath': '/resume', 'requestContext': {'http': {'method': 'GET'}}}, None))"
   ```

## Features Available Locally
- **Sub-20ms Rendering**: Typst compiles `template.typ` + `resume.json` instantly.
- **JSON Resume Schema**: Formatted resume fields matching standard JSON resume specifications.
- **Bedrock Converse API Testing**: Pass `AWS_PROFILE` or AWS environment credentials to test AI edits.
