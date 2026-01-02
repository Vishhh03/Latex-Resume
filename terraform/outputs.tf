output "wake_up_url" {
  value = aws_lambda_function_url.wakeup_url.function_url
}