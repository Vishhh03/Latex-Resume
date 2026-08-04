import json
import os
import subprocess
import base64
import urllib.request
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")
s3 = boto3.client("s3", region_name="us-east-1")

BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO_OWNER = os.environ.get("REPO_OWNER", "")
REPO_NAME = os.environ.get("REPO_NAME", "")

RESUME_SCHEMA = {
    "type": "object",
    "properties": {
        "basics": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "title": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "location": {"type": "string"},
                "website": {"type": "string"},
                "linkedin": {"type": "string"},
                "github": {"type": "string"}
            },
            "required": ["name", "title", "email", "location"]
        },
        "work": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "position": {"type": "string"},
                    "startDate": {"type": "string"},
                    "endDate": {"type": "string"},
                    "location": {"type": "string"},
                    "highlights": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["company", "position", "highlights"]
            }
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "subtitle": {"type": "string"},
                    "website": {"type": "string"},
                    "github": {"type": "string"},
                    "highlights": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["name", "highlights"]
            }
        },
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "institution": {"type": "string"},
                    "area": {"type": "string"},
                    "studyType": {"type": "string"},
                    "startDate": {"type": "string"},
                    "endDate": {"type": "string"},
                    "location": {"type": "string"},
                    "highlights": {"type": "array", "items": {"type": "string"}}
                }
            }
        },
        "skills": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "keywords": {"type": "array", "items": {"type": "string"}}
                }
            }
        },
        "certifications": {"type": "array", "items": {"type": "string"}},
        "openSource": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["basics", "work", "projects", "education", "skills"]
}

def create_response(status_code, body, content_type="application/json"):
    headers = {
        "Content-Type": content_type,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }
    if content_type == "application/json" and not isinstance(body, str):
        body = json.dumps(body)
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": body
    }

def get_current_resume():
    tmp_path = "/tmp/resume.json"
    if os.path.exists(tmp_path):
        with open(tmp_path, "r") as f:
            return json.load(f)
    
    # Fallback to local package copy
    if os.path.exists("./resume.json"):
        with open("./resume.json", "r") as f:
            return json.load(f)
    return {}

def compile_typst(resume_data):
    # Write JSON to /tmp/resume.json
    with open("/tmp/resume.json", "w") as f:
        json.dump(resume_data, f, indent=2)

    template_path = "./template.typ" if os.path.exists("./template.typ") else "/tmp/template.typ"
    pdf_out = "/tmp/resume.pdf"

    # Execute typst binary
    typst_bin = "./typst" if os.path.exists("./typst") else "typst"
    cmd = [typst_bin, "compile", "--root", "/tmp", template_path, pdf_out]
    
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise Exception(f"Typst Compilation Error: {proc.stderr}")

    with open(pdf_out, "rb") as f:
        return f.read()

def handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")

    if http_method == "OPTIONS":
        return create_response(200, {"status": "ok"})

    body = {}
    if event.get("body"):
        try:
            raw_body = event["body"]
            if event.get("isBase64Encoded"):
                raw_body = base64.b64decode(raw_body).decode("utf-8")
            body = json.loads(raw_body)
        except Exception:
            body = {}

    try:
        # GET /resume
        if path == "/resume" and http_method == "GET":
            data = get_current_resume()
            return create_response(200, data)

        # GET /pdf
        elif path == "/pdf" and http_method == "GET":
            data = get_current_resume()
            pdf_bytes = compile_typst(data)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/pdf",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": base64.b64encode(pdf_bytes).decode("utf-8"),
                "isBase64Encoded": True
            }

        # POST /preview
        elif path == "/preview" and http_method == "POST":
            resume_data = body.get("resume", get_current_resume())
            pdf_bytes = compile_typst(resume_data)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/pdf",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": base64.b64encode(pdf_bytes).decode("utf-8"),
                "isBase64Encoded": True
            }

        # POST /update (AI Editing via Bedrock Converse API)
        elif path == "/update" and http_method == "POST":
            instruction = body.get("instruction", "")
            job_desc = body.get("job_description", "")
            current_resume = get_current_resume()

            if not instruction:
                return create_response(400, {"error": "Missing instruction"})

            prompt = (
                f"You are an expert resume architect. Update the candidate's JSON resume based on the following instruction:\n\n"
                f"Instruction: {instruction}\n"
                f"Job Target: {job_desc or 'N/A'}\n\n"
                f"Current JSON Resume:\n{json.dumps(current_resume, indent=2)}\n\n"
                f"Output the complete updated JSON resume strictly adhering to the schema."
            )

            # Bedrock Converse API with Tool Use / Structured JSON Output
            response = bedrock.converse(
                modelId="qwen.qwen3-32b-v1:0",
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": prompt}]
                    }
                ],
                system=[{"text": "You are a professional resume editor. Return ONLY valid JSON matching the resume schema."}],
                inferenceConfig={"temperature": 0.1, "maxTokens": 4096}
            )

            response_text = response["output"]["message"]["content"][0]["text"]
            
            # Extract JSON from output
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start != -1 and json_end != -1:
                updated_resume = json.loads(response_text[json_start:json_end])
            else:
                updated_resume = json.loads(response_text)

            # Save to /tmp
            with open("/tmp/resume.json", "w") as f:
                json.dump(updated_resume, f, indent=2)

            pdf_bytes = compile_typst(updated_resume)

            return create_response(200, {
                "status": "success",
                "data": updated_resume,
                "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8")
            })

        # POST /commit (Push to GitHub)
        elif path == "/commit" and http_method == "POST":
            commit_msg = body.get("message", "Update resume via Serverless Resume Editor")
            if not GITHUB_TOKEN or not REPO_OWNER or not REPO_NAME:
                return create_response(400, {"error": "GitHub credentials not configured"})

            data = get_current_resume()
            content_b64 = base64.b64encode(json.dumps(data, indent=2).encode("utf-8")).decode("utf-8")

            # Check existing file SHA
            sha = ""
            url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/resume.json"
            req = urllib.request.Request(url, headers={
                "Authorization": f"token {GITHUB_TOKEN}",
                "User-Agent": "Resume-Editor-Lambda"
            })
            try:
                with urllib.request.urlopen(req) as r:
                    res_data = json.loads(r.read().decode("utf-8"))
                    sha = res_data.get("sha", "")
            except Exception:
                pass

            # Put File
            put_payload = {
                "message": commit_msg,
                "content": content_b64,
                "branch": "main"
            }
            if sha:
                put_payload["sha"] = sha

            put_req = urllib.request.Request(url, data=json.dumps(put_payload).encode("utf-8"), headers={
                "Authorization": f"token {GITHUB_TOKEN}",
                "User-Agent": "Resume-Editor-Lambda",
                "Content-Type": "application/json"
            }, method="PUT")

            with urllib.request.urlopen(put_req) as r:
                res_body = json.loads(r.read().decode("utf-8"))
                return create_response(200, {
                    "status": "success",
                    "pushed": True,
                    "commit": res_body.get("commit", {}).get("sha", "")
                })

        return create_response(404, {"error": f"Endpoint {path} not found"})

    except Exception as e:
        return create_response(500, {"error": str(e)})
