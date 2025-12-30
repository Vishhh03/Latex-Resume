# --- IAM Role for Lambdas ---
resource "aws_iam_role" "lambda_role" {
  name = "resume_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name = "resume_lambda_permissions"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.conversations.arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "*" 
      },
      {
         Effect = "Allow"
         Action = [
           "ssm:GetParameter"
         ]
         Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.pdf_bucket.arn}/*"
      }
    ]
  })
}

# --- Python Source Code ---
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda_src"
  output_path = "${path.module}/lambda_function.zip"
  excludes    = ["compile_pdf", "__pycache__", "*.pyc"] 
}

# --- Lambda Functions ---

resource "aws_lambda_function" "fetch_resume" {
  function_name    = "FetchResumeFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.fetch_resume"
  runtime          = "python3.9"
  timeout          = 60
  
  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_REPO  = var.github_repo
    }
  }
}

resource "aws_lambda_function" "generate_diff" {
  function_name    = "GenerateDiffFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.generate_diff"
  runtime          = "python3.9"
  timeout          = 120 # Bedrock can take time
  
  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.conversations.name
    }
  }
}

resource "aws_lambda_function" "commit_update" {
  function_name    = "CommitUpdateFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.commit_update"
  runtime          = "python3.9"
  timeout          = 60
  
  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_REPO  = var.github_repo
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.conversations.name
    }
  }
}

resource "aws_lambda_function" "get_history" {
  function_name    = "GetHistoryFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.get_history_handler"
  runtime          = "python3.9"
  timeout          = 30
  
  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_REPO  = var.github_repo
    }
  }
}

resource "aws_lambda_function" "get_resume" {
  function_name    = "GetResumeFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.get_resume_handler"
  runtime          = "python3.9"
  timeout          = 30
  
  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_REPO  = var.github_repo
    }
  }
}

resource "aws_lambda_function" "save_resume" {
  function_name    = "SaveResumeFunction"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers.save_resume_handler"
  runtime          = "python3.9"
  timeout          = 60
  
  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_REPO  = var.github_repo
    }
  }
}

# --- Container Lambda (PDF Compiler) ---
# NOTE: User must push image to ECR first. 
# For now, we point to a placeholder or assume 'latest' exists if they ran the script.
resource "aws_lambda_function" "compile_pdf" {
  function_name = "CompilePdfFunction"
  role          = aws_iam_role.lambda_role.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.resume_compiler.repository_url}:latest"
  timeout       = 120
  memory_size   = 2048

  environment {
    variables = {
      PDF_BUCKET = aws_s3_bucket.pdf_bucket.id
    }
  }
}


# --- API Integrations ---

resource "aws_apigatewayv2_integration" "compile_pdf" {
  api_id           = aws_apigatewayv2_api.resume_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.compile_pdf.invoke_arn
}

resource "aws_apigatewayv2_integration" "get_history" {
  api_id           = aws_apigatewayv2_api.resume_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_history.invoke_arn
}

resource "aws_apigatewayv2_integration" "get_resume" {
  api_id           = aws_apigatewayv2_api.resume_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_resume.invoke_arn
}

resource "aws_apigatewayv2_integration" "save_resume" {
  api_id           = aws_apigatewayv2_api.resume_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.save_resume.invoke_arn
}


# --- Lambda Permissions for API Gateway ---
resource "aws_lambda_permission" "apigw_compile" {
  statement_id  = "AllowAPIGatewayInvokeCompile"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.compile_pdf.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.resume_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_history" {
  statement_id  = "AllowAPIGatewayInvokeHistory"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_history.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.resume_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_resume" {
  statement_id  = "AllowAPIGatewayInvokeResume"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_resume.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.resume_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_save" {
  statement_id  = "AllowAPIGatewayInvokeSave"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_resume.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.resume_api.execution_arn}/*/*"
}
