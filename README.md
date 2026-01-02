# Autonomous Resume Infrastructure

I got tired of manually tweaking my resume for every job application, so I engineered a solution to handle it.

This is a self-healing, serverless platform that hosts my resume and uses an AI agent (Qwen 3 on Bedrock) to generate LaTeX patches for real-time updates.

It costs **$0.00/hr** when nobody is using it.

## Architecture Decisions

### Why AWS ECS Fargate Spot?
Most people would just use a Lambda function. I chose Fargate Spot for two reasons:
1.  **Dependencies**: The resume compiler (`tectonic`) represents a heavy Rust binary dependency. Packaging that into a Lambda Layer is painful and hits size limits fast. With Docker, I just `apt-get install` what I need.
2.  **Cost**: Fargate Spot is dirt cheap (approx. 70% off standard pricing). Since this service only runs for a few minutes when I'm actively editing, Spot interruptions are irrelevant.

### Why Amazon Bedrock?
I didn't want to manage OpenAI API keys in my frontend or worry about rate limits.
Bedrock runs entirely inside my AWS VPC. There are no API keys to leak, and IAM roles handle the authentication. Plus, Qwen 3 32B on Bedrock is strictly pay-per-token, making it significantly cheaper than a ChatGPT Plus subscription for this use case.

### How is it "Efficient"?
The system uses a **Wake-on-Demand** pattern.
1.  **Idle State**: The entire backend is dead. 0 Containers running. **Cost: $0**.
2.  **Trigger**: When I hit the frontend, a tiny Lambda function (The "Wake Up" signal) checks if the backend is running.
3.  **Boot**: If not, it provisions a Fargate Spot task. This takes about 45-60 seconds.
4.  **Shutdown**: The backend has a "Guardian" middleware. If it detects 10 minutes of inactivity, it kills its own process and terminates the ECS task. **Return to Cost: $0**.

## Setup Guide

If you want to deploy this yourself, here is the exact process.

### 1. Prerequisites
*   **AWS Account**: You need admin access.
*   **GitHub Account**: For hosting the code and kicking off Actions.
*   **Terraform**: Installed locally to bootstrap the initial state (optional, can be done via CI if configured).
*   **Cloudflare Account**: For the frontend (Pages).

### 2. Fork & Configure
Fork this repository. Then, create the following secrets in your GitHub Repository settings:

*   `AWS_ACCESS_KEY_ID`: IAM User with permissions to manage ECS, IAM, and S3.
*   `AWS_SECRET_ACCESS_KEY`: The secret key.
*   `CF_API_TOKEN`: Cloudflare Token with `Pages:Edit` and `User Details:Read` permissions.

### 3. Deploy Infrastructure
Go to the `terraform/` directory and update the `terraform.tfvars`:
```hcl
app_name     = "resume-app"
github_token = "your-personal-access-token" // Used by the backend to commit changes
repo_owner   = "your-username"
repo_name    = "your-repo-name"
```
Run the initial provisioning:
```bash
terraform init
terraform apply
```
This single command builds the VPC, ECR repositories, IAM Roles, DynamoDB tables, and S3 buckets.

### 4. Connect Frontend
1.  Go to **Cloudflare Dashboard** > **Workers & Pages**.
2.  Connect your Git repository.
3.  **Framework**: Next.js (Static Export).
4.  **Build Command**: `bun run build`.
5.  **Environment Variables**: Add `NEXT_PUBLIC_WAKE_UP_URL`. You get this URL from the Terraform output (`wake_up_url`).

## Usage
Once deployed, visit your Cloudflare URL.
1.  The site will likely say "Backend Sleeping".
2.  Click "Wake Up". Wait ~60 seconds for Fargate to provision capacity.
3.  Type a request like *"Add Experience: Senior DevOps Engineer at Google, focused on Kubernetes scaling."*
4.  The AI will generate the LaTeX patch, compile the PDF, and present the new version.
5.  If you like it, the backend automatically commits the `resume.tex` change back to this repo.

---
*Reference Implementation by [Vishal Shaji](https://github.com/Vishhh03).*
