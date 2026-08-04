output "api_url" {
  value       = aws_lambda_function_url.resume_api_url.function_url
  description = "The public Lambda Function URL for the Serverless Resume API"
}

output "s3_bucket" {
  value       = aws_s3_bucket.resume_bucket.id
  description = "S3 Bucket for storing resume draft files"
}

output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions_deploy.arn
  description = "IAM Role ARN for GitHub Actions OIDC Keyless Authentication"
}