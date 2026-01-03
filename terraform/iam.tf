# ECS Execution Role
resource "aws_iam_role" "execution" {
  name = "resume-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "execution_standard" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (App Permissions)
resource "aws_iam_role" "task" {
  name = "resume-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "task_perms" {
  name = "resume-app-permissions"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      { Action = ["ecs:StopTask"], Effect = "Allow", Resource = "*" },
      { Action = ["bedrock:InvokeModel"], Effect = "Allow", Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/qwen.qwen3-32b-instruct" },
      { Action = ["dynamodb:GetItem", "dynamodb:UpdateItem"], Effect = "Allow", Resource = aws_dynamodb_table.spend_shield.arn }
    ]
  })
}

# Lambda Wakeup Role
resource "aws_iam_role" "wakeup_role" {
  name = "resume_wakeup_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "wakeup_policy" {
  role = aws_iam_role.wakeup_role.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      { Action = ["ecs:RunTask", "ecs:ListTasks", "ecs:DescribeTasks", "ec2:DescribeNetworkInterfaces"], Effect = "Allow", Resource = "*" },
      { Action = ["dynamodb:GetItem"], Effect = "Allow", Resource = aws_dynamodb_table.spend_shield.arn },
      { Action = ["iam:PassRole"], Effect = "Allow", Resource = [aws_iam_role.execution.arn, aws_iam_role.task.arn] },
      { Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Effect = "Allow", Resource = "*" }
    ]
  })
}