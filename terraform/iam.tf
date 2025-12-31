# Task Execution Role (Pulling images, logging)
resource "aws_iam_role" "ecs_exec_role" {
  name = "resume_ecs_exec_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_exec_basic" {
  role       = aws_iam_role.ecs_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Task Role (Actual logic: DNS, S3, ECS Stop)
resource "aws_iam_role" "fargate_task_role" {
  name = "resume_fargate_task_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "phantom_perms" {
  name = "phantom_backend_permissions"
  role = aws_iam_role.fargate_task_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["route53:ChangeResourceRecordSets"]
        Resource = "arn:aws:route53:::hostedzone/${var.hosted_zone_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:StopTask"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.state_bucket.arn}/*"
      }
    ]
  })
}