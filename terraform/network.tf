data "aws_vpc" "default_vpc" { default = true }
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default_vpc.id]
  }
}

resource "aws_security_group" "app_sg" {
  name        = "resume-app-sg"
  description = "Allow inbound traffic on port 8000"
  vpc_id      = data.aws_vpc.default_vpc.id

  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}