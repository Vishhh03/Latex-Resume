# Deployment Guide

## 1. Local Development (FastAPI)
For rapid development with instant preview and local file editing.

### Prerequisites
- Python 3.9+
- [Tectonic](https://tectonic-typesetting.github.io/) installed and in PATH.
- AWS Credentials configured (for Bedrock access).

### Run Local Server
```bash
cd local_server
pip install -r requirements.txt
uvicorn main:app --reload
```
The API will be available at `http://localhost:8000`.

## 2. Production Deployment (Terraform)
For deploying the serverless infrastructure to AWS.

### Prerequisites
- [Terraform](https://www.terraform.io/) installed.
- Docker installed (for building the compiler image).

### Setup
1. **Configure Secrets**:
   Create a `terraform.tfvars` file with your GitHub credentials:
   ```bash
   cd terraform
   echo 'github_token = "YOUR_GITHUB_TOKEN"' > terraform.tfvars
   ```

2. **Build & Push Docker Image**:
   *You must do this partially first because the Lambda resource depends on the image existing.*
   ```bash
   terraform init
   
   # 1. Create ECR Repo Only (Use quotes for PowerShell compatibility)
   terraform apply -target="aws_ecr_repository.resume_compiler"

   
   # 2. Login, Build, Push
   # (Replace <ACCOUNT_ID> with your actual ID, get it via 'aws sts get-caller-identity')
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   
   cd ../lambda_src/compile_pdf
   docker build -t resume-compiler .
   docker tag resume-compiler:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/resume-compiler:latest
   docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/resume-compiler:latest
   ```

2. **Deploy Full Infrastructure**:
   ```bash
   cd ../../terraform
   
   # Create a variables file (terraform.tfvars)
   echo 'github_token = "YOUR_TOKEN"' > terraform.tfvars
   
   # Apply everything
   terraform apply
   ```

### Notes
- The **Local Backend** edits `resume.tex` directly on your disk.
- The **Production Backend** commits changes to GitHub.
