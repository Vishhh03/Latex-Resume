variable "aws_region" {
  default = "us-east-1"
}

variable "tags" {
  default = {
    Project   = "ResumeBackend"
    ManagedBy = "Terraform"
    Engine    = "Typst"
  }
}

# GitHub Integration
variable "github_token" {
  sensitive = true
}

variable "repo_owner" {}
variable "repo_name" {}

variable "budget_alert_email" {
  default = ""
}