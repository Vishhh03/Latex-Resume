resource "aws_apigatewayv2_api" "resume_api" {
  name          = "resume-api"
  protocol_type = "HTTP"
  tags          = local.common_tags
  
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.resume_api.id
  name        = "prod"
  auto_deploy = true
}

# --- Integrations ---
# We will define integrations in lambda.tf and step_function.tf to keep things co-located
# But for clarity, we can define the routes here if we want centralized routing.
# Let's keep routes here for clarity.

resource "aws_apigatewayv2_route" "update_resume" {
  api_id    = aws_apigatewayv2_api.resume_api.id
  route_key = "POST /update"
  target    = "integrations/${aws_apigatewayv2_integration.step_function.id}"
}

resource "aws_apigatewayv2_route" "preview_resume" {
  api_id    = aws_apigatewayv2_api.resume_api.id
  route_key = "POST /preview"
  target    = "integrations/${aws_apigatewayv2_integration.compile_pdf.id}"
}

resource "aws_apigatewayv2_route" "get_history" {
  api_id    = aws_apigatewayv2_api.resume_api.id
  route_key = "GET /history"
  target    = "integrations/${aws_apigatewayv2_integration.get_history.id}"
}

resource "aws_apigatewayv2_route" "get_resume" {
  api_id    = aws_apigatewayv2_api.resume_api.id
  route_key = "GET /resume"
  target    = "integrations/${aws_apigatewayv2_integration.get_resume.id}"
}

resource "aws_apigatewayv2_route" "save_resume" {
  api_id    = aws_apigatewayv2_api.resume_api.id
  route_key = "POST /save"
  target    = "integrations/${aws_apigatewayv2_integration.save_resume.id}"
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.prod.invoke_url
}
