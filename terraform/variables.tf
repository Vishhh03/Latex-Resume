variable "aws_region" { default = "us-east-1" }
variable "tags" { default = { Project = "ResumeBackend", ManagedBy = "Terraform" } }

# GitHub (For Persistence)
variable "github_token" { sensitive = true }
variable "repo_owner" {}
variable "repo_name" {}

# Cloudflare (Legacy/DNS - kept for compatibility if user fills them, otherwise dummy)
variable "cf_zone_id" { default = "" }
variable "cf_record_id" { default = "" }
variable "cf_api_token" { default = "" }