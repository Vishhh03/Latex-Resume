# --- IAM Role for Step Function ---
resource "aws_iam_role" "sfn_role" {
  name = "resume_sfn_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "sfn_policy" {
  name = "resume_sfn_policy"
  role = aws_iam_role.sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.fetch_resume.arn,
          aws_lambda_function.generate_diff.arn,
          aws_lambda_function.commit_update.arn
        ]
      }
    ]
  })
}

# --- Step Function ---
resource "aws_sfn_state_machine" "resume_workflow" {
  name     = "ResumeWorkflow"
  role_arn = aws_iam_role.sfn_role.arn

  definition = templatefile("${path.module}/../statemachine/resume_workflow.asl.json", {
    FetchResumeFunctionArn   = aws_lambda_function.fetch_resume.arn
    GenerateDiffFunctionArn  = aws_lambda_function.generate_diff.arn
    CommitUpdateFunctionArn  = aws_lambda_function.commit_update.arn
  })
}

# --- API Integration for Step Function ---
resource "aws_apigatewayv2_integration" "step_function" {
  api_id              = aws_apigatewayv2_api.resume_api.id
  integration_type    = "AWS_PROXY"
  integration_subtype = "StepFunctions-StartExecution"
  credentials_arn     = aws_iam_role.apigw_sfn_role.arn
  
  request_parameters = {
    "Input"         = "$request.body"
    "StateMachineArn" = aws_sfn_state_machine.resume_workflow.arn
  }
}

# Role for API Gateway to invoke Step Function
resource "aws_iam_role" "apigw_sfn_role" {
  name = "apigw_sfn_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "apigw_sfn_policy" {
  name = "apigw_sfn_policy"
  role = aws_iam_role.apigw_sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "states:StartExecution"
        Resource = aws_sfn_state_machine.resume_workflow.arn
      }
    ]
  })
}
