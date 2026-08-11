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
        """Verify resume.json exists in resumes/ and contains required schema sections."""
        resume_path = "./resumes/resume.json" if os.path.exists("./resumes/resume.json") else "./resume.json"
        self.assertTrue(os.path.exists(resume_path), "resume.json should exist in resumes/")
        with open(resume_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        self.assertIn("basics", data)
        self.assertIn("work", data)
        self.assertIn("projects", data)
        self.assertIn("education", data)
        self.assertIn("skills", data)
        self.assertEqual(data["basics"]["name"], "Vishal Shaji")

    def test_template_typ_exists(self):
        """Verify template.typ exists in templates/."""
        template_path = "./templates/template.typ" if os.path.exists("./templates/template.typ") else "./template.typ"
        self.assertTrue(os.path.exists(template_path), "template.typ should exist in templates/")

    def test_typst_compilation_local(self):
        """Test local Typst compilation using typst CLI."""
        resume_path = "./resumes/resume.json" if os.path.exists("./resumes/resume.json") else "./resume.json"
        with open(resume_path, "r", encoding="utf-8") as f:
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
        self.assertIn("name", body["basics"])

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
            "body": json.dumps({"instruction": "Change title to Senior Cloud Engineer", "version": "mock_update"})
        }

        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["data"]["basics"]["title"], "Senior Cloud Engineer")

    def test_handler_health(self):
        """Test GET /health endpoint."""
        event = {
            "rawPath": "/health",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertEqual(body["status"], "ok")

    def test_handler_versions(self):
        """Test GET /versions endpoint."""
        event = {
            "rawPath": "/versions",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertIn("versions", body)

    def test_handler_save(self):
        """Test POST /save endpoint with version parameter."""
        sample_resume = {
            "basics": {
                "name": "Test Candidate",
                "title": "Engineer",
                "email": "test@example.com",
                "location": "Remote"
            }
        }
        event = {
            "rawPath": "/save",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"resume": sample_resume, "version": "unittest_save"})
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertEqual(body["status"], "success")

    def test_handler_history(self):
        """Test GET /history endpoint."""
        event = {
            "rawPath": "/history",
            "requestContext": {"http": {"method": "GET"}}
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)

    @patch("lambda_src.handler.bedrock")
    @patch("lambda_src.handler.compile_typst")
    def test_handler_form_urlencoded_update(self, mock_compile, mock_bedrock):
        """Test POST /update endpoint with application/x-www-form-urlencoded body."""
        mock_compile.return_value = b"%PDF-1.4 Mock PDF Content"
        mock_bedrock.converse.return_value = {
            "output": {
                "message": {
                    "content": [{"text": json.dumps({"basics": {"name": "Form Test", "title": "Dev", "email": "a@b.com", "location": "c"}})}]
                }
            }
        }

        event = {
            "rawPath": "/update",
            "requestContext": {"http": {"method": "POST"}},
            "body": "instruction=Update+my+skills&job_description=Target+JD&version=unittest_form"
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)

    def test_resume_agent_tools(self):
        """Test individual ResumeAgent tool execution."""
        try:
            from lambda_src.agent import ResumeAgent
        except ImportError:
            from agent import ResumeAgent

        agent = ResumeAgent()
        jd_res = agent.analyze_job_description("We are looking for a Python AWS Lambda Engineer with Docker and Terraform experience.")
        self.assertIn("keywords", jd_res)
        self.assertIn("python", jd_res["keywords"])
        self.assertIn("aws", jd_res["keywords"])

        sample_resume = {
            "basics": {"name": "Test", "title": "Dev", "email": "t@t.com", "location": "L"},
            "skills": [{"name": "Languages", "keywords": ["Python", "AWS"]}]
        }

        ats_res = agent.calculate_ats_alignment(sample_resume, ["python", "aws", "docker"])
        self.assertGreater(ats_res["score"], 0)
        self.assertIn("python", ats_res["matched_keywords"])
        self.assertIn("docker", ats_res["missing_keywords"])

        updated = agent.update_resume_section(sample_resume, "skills", [{"name": "Tech", "keywords": ["Python", "AWS", "Docker"]}])
        self.assertEqual(len(updated["skills"][0]["keywords"]), 3)

    @patch("lambda_src.handler.compile_typst")
    def test_handler_post_agent_endpoint(self, mock_compile):
        """Test POST /agent endpoint runs autonomous agentic workflow."""
        mock_compile.return_value = b"%PDF-1.4 Mock PDF Content Single Page"

        event = {
            "rawPath": "/agent",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({
                "instruction": "Tailor resume for Cloud Architect role",
                "job_description": "Requires AWS Lambda, Python, Terraform, and Docker.",
                "version": "unittest_agent"
            })
        }
        res = handler(event, None)
        self.assertEqual(res["statusCode"], 200)


        body = json.loads(res["body"])
        self.assertEqual(body["status"], "success")
        self.assertIn("ats_score_before", body)
        self.assertIn("ats_score_after", body)
        self.assertIn("trace_log", body)
        self.assertTrue(len(body["trace_log"]) >= 3)
        self.assertTrue(body["layout_verification"]["fits_single_page"])

    @patch("lambda_src.agent.urllib.request.urlopen")
    def test_resume_agent_byok_openai(self, mock_urlopen):
        """Test BYOK (Bring Your Own Key) OpenAI provider call."""
        try:
            from lambda_src.agent import ResumeAgent
        except ImportError:
            from agent import ResumeAgent

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "choices": [{"message": {"content": json.dumps({
                "basics": {"name": "BYOK Candidate", "title": "Senior AI Architect", "email": "a@b.com", "location": "C"}
            })}}]
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        agent = ResumeAgent()
        res = agent.run_agentic_workflow(
            initial_resume={"basics": {"name": "Test", "title": "Dev", "email": "a@b.com", "location": "c"}},
            instruction="Test BYOK OpenAI",
            job_description="Requires Python, OpenAI, Docker",
            byok={"provider": "openai", "api_key": "sk-testkey123", "model_id": "gpt-4o"}
        )
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["data"]["basics"]["title"], "Senior AI Architect")

    @patch("lambda_src.agent.urllib.request.urlopen")
    def test_resume_agent_byok_google(self, mock_urlopen):
        """Test BYOK (Bring Your Own Key) Google Gemini provider call."""
        try:
            from lambda_src.agent import ResumeAgent
        except ImportError:
            from agent import ResumeAgent

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{"text": json.dumps({
                        "basics": {"name": "Gemini Candidate", "title": "Staff Gemini Engineer", "email": "g@b.com", "location": "C"}
                    })}]
                }
            }]
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        agent = ResumeAgent()
        res = agent.run_agentic_workflow(
            initial_resume={"basics": {"name": "Test", "title": "Dev", "email": "a@b.com", "location": "c"}},
            instruction="Test BYOK Google",
            job_description="Requires Python, Gemini, Docker",
            byok={"provider": "google", "api_key": "AIzaSyTestKey123", "model_id": "gemini-1.5-flash"}
        )
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["data"]["basics"]["title"], "Staff Gemini Engineer")

if __name__ == "__main__":
    unittest.main()



