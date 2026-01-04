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
  timeout          = 15
  
  environment {
    variables = {
      CLUSTER_NAME    = aws_ecs_cluster.main.name
      TASK_DEFINITION = aws_ecs_task_definition.app.arn
      SUBNETS         = join(",", data.aws_subnets.default.ids)
      SECURITY_GROUP  = aws_security_group.app_sg.id
    }
  }
}

resource "aws_lambda_function_url" "wakeup_url" {
  function_name      = aws_lambda_function.wakeup.function_name
  authorization_type = "NONE"
  cors {
    allow_origins     = ["*"]
    allow_methods     = ["*"]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Stop Lambda - Stops all running ECS tasks
# ═══════════════════════════════════════════════════════════════════════════════
data "archive_file" "stop_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda_src/stop.py"
  output_path = "${path.module}/stop.zip"
}

resource "aws_lambda_function" "stop" {
  function_name    = "resume-stop"
  role             = aws_iam_role.wakeup_role.arn  # Reuse same role (has ECS permissions)
  handler          = "stop.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.stop_zip.output_path
  source_code_hash = data.archive_file.stop_zip.output_base64sha256
  timeout          = 15
  
  environment {
    variables = {
      CLUSTER_NAME = aws_ecs_cluster.main.name
    }
  }
}

resource "aws_lambda_function_url" "stop_url" {
  function_name      = aws_lambda_function.stop.function_name
  authorization_type = "NONE"
  cors {
    allow_origins     = ["*"]
    allow_methods     = ["*"]
  }
}