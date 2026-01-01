resource "aws_s3_bucket" "state" {
  bucket_prefix = "resume-state-"
  force_destroy = true # Good for personal projects
}

resource "aws_dynamodb_table" "spend_shield" {
  name         = "DailySpend"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "date"

  attribute {
    name = "date"
    type = "S"
  }
}