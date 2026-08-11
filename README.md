# Typst Resume Architecture & AI Editor

Interactive, serverless resume editor powered by **Typst**, **AWS Lambda**, and the **Amazon Bedrock Converse API**.

```bash
npx typst-resume-cli
```

---

## Technical Overview

This repository hosts a data-driven resume infrastructure that decouples resume content from document formatting. Content is stored as structured JSON (`resume.json`), while layout and typography are controlled by a high-performance Typst template (`template.typ`).

AI-assisted resume modifications are processed via the Amazon Bedrock Converse API using strict JSON Schema enforcement. This guarantees schema-compliant resume edits without formatting errors or compilation failures.

### Performance Benchmarks

| Metric | Legacy Stack (XeLaTeX + ECS Fargate) | Serverless Typst Stack |
| :--- | :--- | :--- |
| **Document Compiler** | TeX Live (`xelatex` ~2GB container) | **Typst** (~15MB binary) |
| **Compute Engine** | AWS ECS Fargate Spot + Cloudflare Tunnel | **AWS Lambda Function URL** |
| **Cold Start Latency** | 45 – 60 seconds | **< 1 second** |
| **Compilation Latency** | 2,000 – 4,000 ms | **~15 ms** |
| **LLM Output Guarantees** | String regex repair | **Bedrock Converse JSON Schema** |
| **Idle Infrastructure Cost** | Scaled-to-zero container polling | **$0.00 / month** (AWS Free Tier) |

---

## System Architecture

```
[ User Input (CLI / Web UI) ]
            │
            ▼
[ AWS Lambda (Python 3.11 + Typst Binary) ]
            │
            ├──▶ [ Amazon Bedrock Converse API ]  ──▶ Structured JSON Schema Update
            ├──▶ [ Typst Compiler Engine ]        ──▶ Sub-20ms PDF Rendering
            └──▶ [ GitHub REST API ]              ──▶ Direct Commit to main
```

---

## Repository Structure

```
.
├── resumes/            # Candidate JSON data sources (master & versioned)
│   ├── resume.json     # Default master candidate data source
│   └── resume_swe.json # Role-specific candidate data variations
├── templates/          # Document layout and design templates
│   ├── template.typ    # Typst layout & typography rules
│   └── resume.tex      # Legacy LaTeX layout template
├── lambda_src/         # Python 3.11 AWS Lambda backend & handler logic
│   ├── handler.py      # Core API router (/resume, /pdf, /update, /commit, /versions)
│   ├── schema.json     # Draft-07 JSON Schema definition
│   └── test_handler.py # Automated backend unit test suite
├── terraform/          # Infrastructure-as-Code (IaC) configuration
├── web/                # Next.js frontend preview dashboard
└── cli/                # Terminal CLI (npx typst-resume-cli)
```

---

## Local Development & Testing

### 1. Compile PDF Locally
Compile `resumes/resume.json` using the local Typst binary:
```powershell
.\typst.exe compile --root . templates/template.typ resumes/resume.pdf
```

To watch for file edits and recompile automatically:
```powershell
.\typst.exe watch --root . templates/template.typ resumes/resume.pdf
```

### 2. Run Backend Unit Tests
Execute the Python test suite (10 unit tests):
```bash
python -m unittest lambda_src/test_handler.py
```

### 3. Run Web Dashboard Locally
```bash
cd web
npm run dev
```

---

## AWS Infrastructure Deployment

### Prerequisites
- AWS CLI configured with administrator permissions
- Terraform >= 1.5.0
- GitHub Personal Access Token (PAT) with `repo` scope

### Terraform Deployment Steps

1. Navigate to the terraform directory:
   ```bash
   cd terraform
   ```

2. Create `terraform.tfvars`:
   ```hcl
   github_token       = "ghp_YOUR_GITHUB_PAT"
   repo_owner         = "Vishhh03"
   repo_name          = "Latex-Resume"
   aws_region         = "us-east-1"
   budget_alert_email = "your-email@example.com"
   ```

3. Initialize and apply:
   ```bash
   terraform init
   terraform apply
   ```

### CI/CD & Security
- **Keyless Authentication**: GitHub Actions deploys code updates using AWS IAM OpenID Connect (OIDC) federation (`sts:AssumeRoleWithWebIdentity`). Static AWS keys are not required in repository secrets.
- **Cost Controls**: Hard-capped AWS monthly budget alert ($5.00 limit) configured via Amazon SNS notifications.

---

## License

MIT License. Developed by [Vishal Shaji](https://github.com/Vishhh03).
