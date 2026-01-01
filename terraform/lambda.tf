data "archive_file" "wakeup_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda_src/wake_up.py"
  output_path = "${path.module}/wake_up.zip"
}

resource "aws_iam_role" "wakeup_role" {
  name = "phantom_wakeup_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "wakeup_policy" {
  role = aws_iam_role.wakeup_role.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      { Action = ["ecs:RunTask", "ecs:ListTasks"], Effect = "Allow", Resource = "*" },
      { Action = ["iam:PassRole"], Effect = "Allow", Resource = "*" }, # Needed to pass role to ECS Task
      { Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Effect = "Allow", Resource = "*" }
    ]
  })
}

resource "aws_lambda_function" "wakeup" {
  function_name = "phantom-wakeup"
  role          = aws_iam_role.wakeup_role.arn
  handler       = "wake_up.handler"
  runtime       = "python3.12"
  filename      = data.archive_file.wakeup_zip.output_path
  source_code_hash = data.archive_file.wakeup_zip.output_base64sha256
  timeout       = 30

  environment {
    variables = {
      CLUSTER_NAME    = aws_ecs_cluster.main.name
      TASK_DEFINITION = aws_ecs_task_definition.app.family # Using family uses latest LATEST revision
      SUBNETS         = join(",", data.aws_subnets.default.ids) # We need to get default subnets
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

# Data source for default VPC subnets (assuming we run in default VPC)
data "aws_vpc" "default" { default = true }
data "aws_subnets" "default" {
  filter { name = "vpc-id", values = [data.aws_vpc.default.id] }
}

output "wake_up_url" {
  value = aws_lambda_function_url.wakeup_url.function_url
}
