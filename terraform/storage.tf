resource "aws_s3_bucket" "resume_bucket" {
  bucket_prefix = "serverless-resume-drafts-"
  force_destroy = true
}