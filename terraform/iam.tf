resource "aws_iam_role" "task" {
  name = "resume-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "perms" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      { Action = ["ecs:StopTask"], Effect = "Allow", Resource = "*" },
      { Action = ["s3:PutObject", "s3:GetObject"], Effect = "Allow", Resource = "*" },
      { Action = ["bedrock:InvokeModel"], Effect = "Allow", Resource = "*" },
      { Action = ["dynamodb:GetItem", "dynamodb:UpdateItem"], Effect = "Allow", Resource = "arn:aws:dynamodb:*:*:table/DailySpend" }
    ]
  })
}

resource "aws_iam_role" "execution" {
  name = "resume-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}