# 1. IAM Role for the SOCI Indexer
resource "aws_iam_role" "soci_indexer_role" {
  name = "soci-indexer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# 2. Permissions for the Indexer (Read image, Push index back to ECR)
resource "aws_iam_role_policy" "soci_indexer_policy" {
  name = "soci-indexer-policy"
  role = aws_iam_role.soci_indexer_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:PutImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart"
        ]
        Resource = aws_ecr_repository.repo.arn
      },
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# 3. The SOCI Indexer Lambda 
# Note: AWS provides a pre-built container image for the SOCI indexer.
resource "aws_lambda_function" "soci_indexer" {
  function_name = "soci-indexer"
  role          = aws_iam_role.soci_indexer_role.arn
  image_uri     = "public.ecr.aws/aws-lambda/soci-indexer:latest" 
  package_type  = "Image"
  timeout       = 300
  memory_size   = 2048 # Indexing is CPU/Memory intensive
}

# 4. EventBridge Trigger (Triggered when ECR "Action: Pushing Image" completes)
resource "aws_cloudwatch_event_rule" "ecr_push_rule" {
  name        = "soci-index-on-push"
  description = "Trigger SOCI indexer when a new image is pushed to ECR"

  event_pattern = jsonencode({
    source      = ["aws.ecr"]
    detail-type = ["ECR Image Action"]
    detail = {
      action-type     = ["PUSH"]
      result          = ["SUCCESS"]
      repository-name = [aws_ecr_repository.repo.name]
    }
  })
}

resource "aws_cloudwatch_event_target" "trigger_soci_lambda" {
  rule      = aws_cloudwatch_event_rule.ecr_push_rule.name
  target_id = "soci-indexer-lambda"
  arn       = aws_lambda_function.soci_indexer.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.soci_indexer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecr_push_rule.arn
}