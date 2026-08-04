# Serverless Typst Resume Editor

```bash
npx latex-resume-cli
```

An ultra-fast, serverless resume editor powered by **Typst**, **AWS Lambda**, and **Amazon Bedrock (Converse API)**.

Tell it what you want in plain English (*"add 2 years at Google doing Kubernetes stuff"*), and AI updates your resume with 100% structured JSON precision. Compiles in **~15 milliseconds** with **<1s cold start** and costs **$0/month** when idle.

---

## ⚡ Key Upgrades (Typst + Lambda Migration)

| Feature | Old Architecture | New Serverless Typst Stack |
| :--- | :--- | :--- |
| **Engine** | TeX Live (~2GB, `xelatex`) | **Typst** (~15MB Rust Binary) |
| **Compute Stack** | ECS Fargate Spot + Cloudflare Tunnel | **AWS Lambda Function URL** |
| **Cold Start** | 45 – 60 seconds | **< 1 second** |
| **PDF Compilation** | 2 – 4 seconds | **~15 milliseconds** |
| **AI Editing Engine** | Raw String Regex Patching | **Bedrock Converse API + JSON Schema** |
| **Idle Cost** | $0/hr idle (complex wake/stop Lambdas) | **$0/month** (Serverless Free Tier) |

---

## 🏗️ How It Works

```
You: "Add 2 years at Google doing Kubernetes"
     ↓
AWS Lambda (Function URL)
     ↓
Amazon Bedrock (Converse API w/ JSON Schema) → Generates typed resume JSON
     ↓
Typst Engine (~15ms compile) → Generates PDF preview
     ↓
Accept → Auto-commits resume.json to GitHub via REST API
```

---

## 🛠️ Architecture Overview

- **Typst**: Modern markup language compiled in sub-20ms with a tiny ~15MB binary.
- **AWS Lambda**: Serverless backend handling API requests, Bedrock LLM calls, and Typst compilation.
- **Amazon Bedrock**: Powering AI editing via Qwen/Claude using Bedrock's Converse API with structured JSON output guarantees.
- **Next.js Frontend**: Clean web interface for live side-by-side JSON/PDF preview and AI prompt interaction.

---

## 🚀 Quick Setup & Deploy

### Prerequisites
- AWS Account with Bedrock Access enabled
- Terraform installed
- GitHub Personal Access Token (PAT)

### Deploy Infrastructure

1. Clone the repository:
   ```bash
   git clone https://github.com/Vishhh03/Latex-Resume.git
   cd Latex-Resume/terraform
   ```

2. Create `terraform.tfvars`:
   ```hcl
   github_token       = "ghp_..."
   repo_owner         = "your-username"
   repo_name          = "your-repo"
   budget_alert_email = "you@example.com"
   ```

3. Deploy:
   ```bash
   terraform init
   terraform apply
   ```

4. Run CLI:
   ```bash
   npx latex-resume-cli
   ```

---

Built by [Vishal Shaji](https://github.com/Vishhh03)
