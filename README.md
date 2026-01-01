# Autonomous Resume Infrastructure (AI-Latex-Editor)

I got tired of manually tweaking my resume for every job application, so I over-engineered a solution to do it for me.

This isn't just a static PDF host. It's a **self-healing, serverless DevOps platform** that hosts my resume and lets an AI agent (Llama 3 on Bedrock) write LaTeX patches to update it in real-time.

**The flex?** It costs **$0.00/hr** when idle. It only spins up the backend when I actually talk to it.

## The Architecture: "Wake-on-Demand"

I designed this to be dirt cheap but enterprise-grade.

1.  **Frontend**: Static Next.js site hosted on **Cloudflare Pages / Vercel**. Fast, free, global CDN.
2.  **The "Guardian"**: A tiny Python Lambda function. It acts as a gatekeeper, checking my strict budget ($0.50/day hard limit) before allowing anything else to run.
3.  **Backend**: An ephemeral **AWS Fargate Spot** container running `Bun`. It boots in seconds, pulls the latest resume from Git, applies AI edits, recompiles the LaTeX with Tectonic, and shuts itself down immediately after.
4.  **AI Brain**: **Amazon Bedrock** (Llama 3 70B). It reads the raw LaTeX and generates precise JSON patches to update my experience bullet points without breaking the formatting.

## Tech Stack
*   **Infrastructure**: Terraform (IaaC). One command deploys the entire stack (VPC, ECR, ECS, IAM, DynamoDB).
*   **Compute**: AWS Lambda + ECS Fargate Spot.
*   **Runtime**: Bun (TypeScript) for the API, Python for the Lambda.
*   **Frontend**: Next.js + Tailwind.
*   **Resume Engine**: LaTeX + Tectonic (Rust-based compiler).

## Deployment

Everything is automated via **GitHub Actions**.

*   **Frontend**: Pushing to `main` triggers a build on Cloudflare/Vercel.
*   **Backend**: Pushing changes to `compute/` builds a new Docker image and pushes it to AWS ECR.
*   **Application**: The backend pulls the latest `resume.tex` from this repo on startup, so I don't need to rebuild Docker images just to change a typo.

## Why?
Because spending 3 hours adjusting margins in Word is boring.
Building a distributed serverless autonomous agent to do it for me took way longer, but it was way more fun.

---
*Built by [Vishal Shaji](https://github.com/Vishhh03).*
