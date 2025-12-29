# --- DynamoDB ---
resource "aws_dynamodb_table" "conversations" {
  name           = "ConversationsTable"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "conversation_id"

  attribute {
    name = "conversation_id"
    type = "S"
  }

  tags = local.common_tags
}

# --- S3 Bucket for PDF Previews ---
resource "aws_s3_bucket" "pdf_bucket" {
  bucket_prefix = "resume-previews-"
  force_destroy = true
  tags          = local.common_tags
}

resource "aws_s3_bucket_cors_configuration" "pdf_bucket" {
  bucket = aws_s3_bucket.pdf_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

# --- ECR Repository for Tectonic Compiler ---
resource "aws_ecr_repository" "resume_compiler" {
  name                 = "resume-compiler"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
  
  tags = local.common_tags
}
