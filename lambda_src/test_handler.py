import unittest
import json
import os
import subprocess
from unittest.mock import patch, MagicMock

# Import handler functions
from lambda_src.handler import (
    RESUME_SCHEMA,
    get_current_resume,
    compile_typst,
    handler
)

class TestResumeServerlessBackend(unittest.TestCase):

    def test_resume_json_exists_and_valid(self):
        """Verify resume.json exists and contains required schema sections."""
        self.assertTrue(os.path.exists("./resume.json"), "resume.json should exist in root")
        with open("./resume.json", "r") as f:
            data = json.load(f)
        
        self.assertIn("basics", data)
        self.assertIn("work", data)
        self.assertIn("projects", data)
        self.assertIn("education", data)
        self.assertIn("skills", data)
        self.assertEqual(data["basics"]["name"], "Vishal Shaji")

    def test_template_typ_exists(self):
        """Verify template.typ exists in root."""
        self.assertTrue(os.path.exists("./template.typ"), "template.typ should exist in root")

    def test_typst_compilation_local(self):
        """Test local Typst compilation using typst CLI."""
        with open("./resume.json", "r") as f:
            data = json.load(f)
        pdf_bytes = compile_typst(data)
        self.assertTrue(len(pdf_bytes) > 0, "Compiled PDF bytes should be non-empty")

    def test_handler_get_resume(self):
        """Test GET /resume endpoint."""
        event = {
            "rawPath": "/resume",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertEqual(body["basics"]["name"], "Vishal Shaji")

    def test_handler_cors_options(self):
        """Test OPTIONS preflight endpoint."""
        event = {
            "rawPath": "/update",
            "requestContext": {"http": {"method": "OPTIONS"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertIn("Access-Control-Allow-Origin", res["headers"])

    def test_handler_404_not_found(self):
        """Test invalid route returns 404."""
        event = {
            "rawPath": "/invalid-route",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 404)

    def test_handler_update_missing_instruction(self):
        """Test POST /update with empty body returns 400 Bad Request."""
        event = {
            "rawPath": "/update",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({})
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 400)
        body = json.loads(res["body"])
        self.assertIn("error", body)

    def test_handler_post_commit_no_credentials(self):
        """Test POST /commit without GitHub credentials returns 400."""
        event = {
            "rawPath": "/commit",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"message": "Test commit"})
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 400)

    @patch("lambda_src.handler.compile_typst")
    def test_handler_get_pdf(self, mock_compile):
        """Test GET /pdf endpoint returns base64 PDF."""
        mock_compile.return_value = b"%PDF-1.4 Fake PDF Content"
        event = {
            "rawPath": "/pdf",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertTrue(res.get("isBase64Encoded"))

    @patch("lambda_src.handler.bedrock")
    @patch("lambda_src.handler.compile_typst")
    def test_handler_post_update_mock(self, mock_compile, mock_bedrock):
        """Test POST /update endpoint with mocked Bedrock Converse API."""
        mock_compile.return_value = b"%PDF-1.4 Mock PDF Content"
        
        updated_mock_resume = {
            "basics": {
                "name": "Vishal Shaji",
                "title": "Senior Cloud Engineer",
                "email": "vishshaji03@gmail.com",
                "location": "Kochi, India"
            },
            "work": [],
            "projects": [],
            "education": [],
            "skills": []
        }

        mock_bedrock.converse.return_value = {
            "output": {
                "message": {
                    "content": [
                        {"text": json.dumps(updated_mock_resume)}
                    ]
                }
            }
        }

        event = {
            "rawPath": "/update",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"instruction": "Change title to Senior Cloud Engineer"})
        }

        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["data"]["basics"]["title"], "Senior Cloud Engineer")

if __name__ == "__main__":
    unittest.main()
