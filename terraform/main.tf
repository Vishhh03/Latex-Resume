terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Local variables for resource naming
locals {
  app_name = "resume-editor"
  common_tags = {
    Project   = "latex-resume"
    ManagedBy = "Terraform"
  }
}
