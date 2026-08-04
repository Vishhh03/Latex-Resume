data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda_src"
  output_path = "${path.module}/handler.zip"
  excludes    = ["*.zip", "__pycache__", "bin", "resume.json"]
}

resource "aws_lambda_function" "resume_api" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  function_name    = "resume-editor-api"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "handler.handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.resume_bucket.id
      GITHUB_TOKEN   = var.github_token
      REPO_OWNER     = var.repo_owner
      REPO_NAME      = var.repo_name
    }
  }

  tags = var.tags
}

resource "aws_lambda_function_url" "resume_api_url" {
  function_name      = aws_lambda_function.resume_api.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    max_age           = 300
  }
}