resource "aws_ecs_cluster" "phantom_cluster" {
  name = "resume-phantom-cluster"
  
  # Enable SOCI Indexing support (Managed by Fargate)
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "phantom_cp" {
  cluster_name = aws_ecs_cluster.phantom_cluster.name
  capacity_providers = ["FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "resume_task" {
  family                   = "resume-phantom-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_exec_role.arn
  task_role_arn            = aws_iam_role.fargate_task_role.arn

  container_definitions = jsonencode([{
    name  = "resume-api"
    image = "${aws_ecr_repository.resume_compiler.repository_url}:latest"
    portMappings = [{ containerPort = 8000 }]
    environment = [
      { name = "HOSTED_ZONE_ID", value = var.hosted_zone_id },
      { name = "STATE_BUCKET",   value = aws_s3_bucket.state_bucket.id }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/resume-phantom"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/resume-phantom"
  retention_in_days = 7
}