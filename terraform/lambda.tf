data "archive_file" "wakeup_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda_src/wake_up.py"
  output_path = "${path.module}/wake_up.zip"
}

resource "aws_lambda_function" "wakeup" {
  function_name    = "resume-wakeup"
  role             = aws_iam_role.wakeup_role.arn
  handler          = "wake_up.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.wakeup_zip.output_path
  source_code_hash = data.archive_file.wakeup_zip.output_base64sha256
  
  environment {
    variables = {
      CLUSTER_NAME    = aws_ecs_cluster.main.name
      TASK_DEFINITION = aws_ecs_task_definition.app.arn
      SUBNETS         = join(",", data.aws_subnets.default.ids)
    }
  }
}

resource "aws_lambda_function_url" "wakeup_url" {
  function_name      = aws_lambda_function.wakeup.function_name
  authorization_type = "NONE"
  cors {
    allow_origins = ["*"]
    allow_methods = ["GET"]
  }
}