variable "aws_region" { default = "us-east-1" }
variable "tags" { default = { Project = "ResumeBackend", ManagedBy = "Terraform" } }

# GitHub (For Persistence)
variable "github_token" { sensitive = true }
variable "repo_owner" {}
variable "repo_name" {}

# --- Variables for Vercel & GitHub ---
variable "vercel_api_token" { type = string; sensitive = true }
variable "vercel_record_id" { type = string }