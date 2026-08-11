resource "aws_s3_bucket" "resume_bucket" {
  bucket_prefix = "serverless-resume-drafts-"
  force_destroy = true
}

resource "aws_s3_object" "default_resume" {
  bucket = aws_s3_bucket.resume_bucket.id
  key    = "resumes/resume.json"
  source = "${path.module}/../resumes/resume.json"
  etag   = filemd5("${path.module}/../resumes/resume.json")
}