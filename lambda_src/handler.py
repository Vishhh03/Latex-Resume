import json
import os
import sys
import subprocess
import base64
import urllib.request
import boto3

try:
    from lambda_src.agent import ResumeAgent
except ImportError:
    try:
        from agent import ResumeAgent
    except ImportError:
        ResumeAgent = None

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))

BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO_OWNER = os.environ.get("REPO_OWNER", "")
REPO_NAME = os.environ.get("REPO_NAME", "")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-micro-v1:0")

def load_resume_schema():
    schema_path = "./schema.json" if os.path.exists("./schema.json") else os.path.join(os.path.dirname(__file__), "schema.json")
    if os.path.exists(schema_path):
        with open(schema_path, "r") as f:
            return json.load(f)
    return {}

RESUME_SCHEMA = load_resume_schema()

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

DEFAULT_FALLBACK_RESUME = {
    "basics": {
        "name": "Candidate Name",
        "title": "Software Engineer",
        "email": "candidate@example.com",
        "location": "City, Country",
        "summary": "Professional software engineer specializing in scalable systems and cloud infrastructure."
    },
    "work": [],
    "projects": [],
    "education": [],
    "skills": []
}

def get_version_key(version="default"):
    if not version or version in ("default", "master", "main"):
        return "default", "resume.json", "resumes/resume.json"
    clean_v = "".join(c for c in version if c.isalnum() or c in ("_", "-")).lower()
    if not clean_v:
        return "default", "resume.json", "resumes/resume.json"
    return clean_v, f"resume_{clean_v}.json", f"resumes/resume_{clean_v}.json"

def get_available_versions():
    versions = set(["default"])
    search_dirs = ["./resumes", ".", os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "resumes")]
    for d in search_dirs:
        if os.path.exists(d):
            try:
                for fname in os.listdir(d):
                    if fname == "resume.json":
                        versions.add("default")
                    elif fname.startswith("resume_") and fname.endswith(".json"):
                        v = fname[7:-5]
                        if v:
                            versions.add(v)
            except Exception:
                pass
    
    if BUCKET_NAME:
        try:
            res = s3.list_objects_v2(Bucket=BUCKET_NAME)
            for obj in res.get("Contents", []):
                k = obj.get("Key", "")
                fname = os.path.basename(k)
                if fname == "resume.json":
                    versions.add("default")
                elif fname.startswith("resume_") and fname.endswith(".json"):
                    v = fname[7:-5]
                    if v:
                        versions.add(v)
        except Exception:
            pass

    return sorted(list(versions))

def get_current_resume(version="default"):
    v_name, filename, s3_key = get_version_key(version)

    # 1. Try /tmp
    tmp_paths = [f"/tmp/resumes/{filename}", f"/tmp/{filename}"]
    for tmp_path in tmp_paths:
        if os.path.exists(tmp_path):
            try:
                with open(tmp_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "basics" in data:
                        return data
            except Exception:
                pass

    # 2. Try S3
    if BUCKET_NAME:
        s3_keys_to_check = [s3_key, filename]
        for key in s3_keys_to_check:
            try:
                res = s3.get_object(Bucket=BUCKET_NAME, Key=key)
                data = json.loads(res["Body"].read().decode("utf-8"))
                if isinstance(data, dict) and "basics" in data:
                    return data
            except Exception:
                pass

    # 3. Try local filesystem
    local_paths = [
        f"./resumes/{filename}",
        f"./{filename}",
        os.path.join(os.path.dirname(__file__), "resumes", filename),
        os.path.join(os.path.dirname(__file__), filename)
    ]
    for p in local_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "basics" in data:
                        return data
            except Exception:
                pass

    if v_name != "default":
        return get_current_resume("default")

    return DEFAULT_FALLBACK_RESUME

def ensure_typst_binary():
    if sys.platform == "win32":
        if os.path.exists("./typst.exe"):
            return "./typst.exe"
        return "typst"

    # Check local or packaged typst binary
    candidates = [
        "./bin/typst",
        os.path.join(os.path.dirname(__file__), "bin", "typst"),
        "./typst",
        os.path.join(os.path.dirname(__file__), "typst"),
        "/tmp/typst"
    ]
    for c in candidates:
        if os.path.exists(c):
            return c

    tmp_typst = "/tmp/typst"
    # Auto-fetch static Linux typst binary on Lambda cold start
    try:
        url = "https://github.com/typst/typst/releases/download/v0.11.0/typst-x86_64-unknown-linux-musl.tar.xz"
        tar_path = "/tmp/typst.tar.xz"
        import urllib.request
        import tarfile

        urllib.request.urlretrieve(url, tar_path)
        with tarfile.open(tar_path, "r:xz") as tar:
            for member in tar.getmembers():
                if member.name.endswith("/typst") or member.name == "typst":
                    f = tar.extractfile(member)
                    if f:
                        with open(tmp_typst, "wb") as out:
                            out.write(f.read())
                        os.chmod(tmp_typst, 0o755)
                        return tmp_typst
    except Exception as e:
        print(f"Warning: Failed to auto-download typst binary: {e}")

    return "typst"

def get_available_styles():
    styles = set(["template", "modern", "minimal", "classic"])
    search_dirs = ["./templates", os.path.join(os.path.dirname(__file__), "templates"), "."]
    for d in search_dirs:
        if os.path.exists(d):
            try:
                for fname in os.listdir(d):
                    if fname.endswith(".typ"):
                        s = fname[:-4]
                        if s:
                            styles.add(s)
            except Exception:
                pass
    return sorted(list(styles))

def compile_typst(resume_data, style="template"):
    import tempfile
    import shutil

    clean_style = "".join(c for c in style if c.isalnum() or c in ("_", "-")).lower() if style else "template"
    if not clean_style:
        clean_style = "template"

    with tempfile.TemporaryDirectory() as work_dir:
        json_path = os.path.join(work_dir, "resume.json")
        resumes_dir = os.path.join(work_dir, "resumes")
        os.makedirs(resumes_dir, exist_ok=True)
        resumes_json_path = os.path.join(resumes_dir, "resume.json")
        pdf_out = os.path.join(work_dir, "resume.pdf")

        # Write JSON data to both paths for Typst resolution compatibility
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(resume_data, f, indent=2)
        with open(resumes_json_path, "w", encoding="utf-8") as f:
            json.dump(resume_data, f, indent=2)

        template_candidates = [
            f"./templates/{clean_style}.typ",
            os.path.join(os.path.dirname(__file__), "templates", f"{clean_style}.typ"),
            "./templates/template.typ",
            os.path.join(os.path.dirname(__file__), "templates", "template.typ"),
            os.path.join(os.path.dirname(__file__), "template.typ"),
            "./template.typ"
        ]
        template_src = None
        for cand in template_candidates:
            if os.path.exists(cand):
                template_src = cand
                break

        if not template_src:
            raise Exception(f"Template '{clean_style}.typ' not found in templates/ or root")

        template_dst = os.path.join(work_dir, "template.typ")
        shutil.copyfile(template_src, template_dst)

        typst_bin = ensure_typst_binary()
        cmd = [typst_bin, "compile", "--root", work_dir, template_dst, pdf_out]

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
        raw_body = event["body"]
        if isinstance(raw_body, dict):
            body = raw_body
        elif isinstance(raw_body, str):
            try:
                if event.get("isBase64Encoded"):
                    raw_body = base64.b64decode(raw_body).decode("utf-8")
                try:
                    body = json.loads(raw_body)
                except Exception:
                    import urllib.parse
                    parsed = urllib.parse.parse_qs(raw_body)
                    body = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
            except Exception:
                body = {}
    if not isinstance(body, dict):
        body = {}


    query_params = event.get("queryStringParameters") or {}
    if not query_params and event.get("rawQueryString"):
        import urllib.parse
        query_params = {k: v[0] if len(v) == 1 else v for k, v in urllib.parse.parse_qs(event["rawQueryString"]).items()}
    version = query_params.get("version") or (body.get("version") if isinstance(body, dict) else "default") or "default"
    style = query_params.get("style") or (body.get("style") if isinstance(body, dict) else "template") or "template"

    try:
        # GET /health
        if path == "/health" and http_method == "GET":
            return create_response(200, {"status": "ok", "engine": "typst"})

        # GET /versions
        elif path == "/versions" and http_method == "GET":
            return create_response(200, {"versions": get_available_versions()})

        # GET /styles
        elif path == "/styles" and http_method == "GET":
            return create_response(200, {"styles": get_available_styles()})

        # GET /resume
        elif path == "/resume" and http_method == "GET":
            data = get_current_resume(version)
            return create_response(200, data)

        # GET /pdf
        elif path == "/pdf" and http_method == "GET":
            data = get_current_resume(version)
            pdf_bytes = compile_typst(data, style)
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
            resume_data = None
            if isinstance(body, dict):
                if "resume" in body and isinstance(body["resume"], dict):
                    resume_data = body["resume"]
                elif "json" in body and isinstance(body["json"], dict):
                    resume_data = body["json"]
                elif "basics" in body:
                    resume_data = body
            if not resume_data:
                resume_data = get_current_resume(version)

            pdf_bytes = compile_typst(resume_data, style)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/pdf",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": base64.b64encode(pdf_bytes).decode("utf-8"),
                "isBase64Encoded": True
            }

        # POST /save
        elif path == "/save" and http_method == "POST":
            save_data = None
            if isinstance(body, dict):
                if "resume" in body and isinstance(body["resume"], dict):
                    save_data = body["resume"]
                elif "json" in body and isinstance(body["json"], dict):
                    save_data = body["json"]
                elif "basics" in body:
                    save_data = body

            if not save_data:
                return create_response(400, {"error": "Invalid resume data provided"})

            v_name, filename, s3_key = get_version_key(version)
            tmp_path = f"/tmp/resumes/{filename}" if os.path.exists("/tmp") else f"resumes/{filename}"
            os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(save_data, f, indent=2)

            if os.path.exists("./resumes"):
                try:
                    with open(f"./resumes/{filename}", "w", encoding="utf-8") as f:
                        json.dump(save_data, f, indent=2)
                except Exception:
                    pass

            if BUCKET_NAME:
                try:
                    s3.put_object(
                        Bucket=BUCKET_NAME,
                        Key=s3_key,
                        Body=json.dumps(save_data, indent=2).encode("utf-8"),
                        ContentType="application/json"
                    )
                except Exception as s3_err:
                    print(f"Warning: Failed to persist save to S3: {s3_err}")

            return create_response(200, {"status": "success", "message": f"Resume version '{v_name}' saved", "version": v_name})

        # GET /history
        elif path == "/history" and http_method == "GET":
            if not GITHUB_TOKEN or not REPO_OWNER or not REPO_NAME:
                return create_response(200, [])

            v_name, filename, s3_key = get_version_key(version)
            url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/commits?path=resumes/{filename}&per_page=10"
            req = urllib.request.Request(url, headers={
                "Authorization": f"token {GITHUB_TOKEN}",
                "User-Agent": "Resume-Editor-Lambda"
            })
            try:
                with urllib.request.urlopen(req) as r:
                    commits_data = json.loads(r.read().decode("utf-8"))
                    formatted = []
                    for c in commits_data:
                        formatted.append({
                            "sha": c.get("sha", ""),
                            "message": c.get("commit", {}).get("message", ""),
                            "author": c.get("commit", {}).get("author", {}).get("name", ""),
                            "date": c.get("commit", {}).get("author", {}).get("date", "")
                        })
                    return create_response(200, formatted)
            except Exception:
                return create_response(200, [])

        # POST /agent or POST /update (Autonomous Resume Agent Workflow)
        elif (path == "/agent" or path == "/update") and http_method == "POST":
            instruction = body.get("instruction", "")
            job_desc = body.get("job_description", "")
            agent_mode = body.get("agent_mode", True) if path == "/agent" else body.get("agent_mode", False)
            current_resume = get_current_resume(version)

            if not instruction and not job_desc:
                return create_response(400, {"error": "Missing instruction or job_description"})

            # Extract BYOK (Bring Your Own Key) configuration
            headers_dict = event.get("headers", {}) or {}
            headers_lower = {k.lower(): v for k, v in headers_dict.items()}
            
            byok = body.get("byok", {}) if isinstance(body.get("byok"), dict) else {}
            if not byok.get("api_key") and headers_lower.get("x-api-key"):
                byok["api_key"] = headers_lower.get("x-api-key")
            if not byok.get("provider") and headers_lower.get("x-llm-provider"):
                byok["provider"] = headers_lower.get("x-llm-provider")
            if not byok.get("model_id") and headers_lower.get("x-model-id"):
                byok["model_id"] = headers_lower.get("x-model-id")

            v_name, filename, s3_key = get_version_key(version)

            # If agentic mode requested or hitting /agent endpoint
            if agent_mode and ResumeAgent is not None:
                agent = ResumeAgent(bedrock_client=bedrock, bedrock_model_id=BEDROCK_MODEL_ID, compile_func=compile_typst)
                result = agent.run_agentic_workflow(
                    initial_resume=current_resume,
                    instruction=instruction or "Optimize resume for target role",
                    job_description=job_desc,
                    byok=byok
                )

                updated_resume = result["data"]
                
                # Save to /tmp
                tmp_path = f"/tmp/resumes/{filename}" if os.path.exists("/tmp") else f"resumes/{filename}"
                os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(updated_resume, f, indent=2)

                if os.path.exists("./resumes"):
                    try:
                        with open(f"./resumes/{filename}", "w", encoding="utf-8") as f:
                            json.dump(updated_resume, f, indent=2)
                    except Exception:
                        pass

                # Persist update to S3
                if BUCKET_NAME:
                    try:
                        s3.put_object(
                            Bucket=BUCKET_NAME,
                            Key=s3_key,
                            Body=json.dumps(updated_resume, indent=2).encode("utf-8"),
                            ContentType="application/json"
                        )
                    except Exception as s3_err:
                        print(f"Warning: Failed to persist updated resume to S3: {s3_err}")

                result["version"] = v_name
                return create_response(200, result)

            # Single-pass legacy update fallback
            prompt = (
                f"You are an expert resume architect. Update the candidate's JSON resume based on the following instruction:\n\n"
                f"Instruction: {instruction}\n"
                f"Job Target: {job_desc or 'N/A'}\n\n"
                f"Current JSON Resume:\n{json.dumps(current_resume, indent=2)}\n\n"
                f"Output the complete updated JSON resume strictly adhering to the schema."
            )

            # Bedrock Converse API with Structured JSON Output
            try:
                response = bedrock.converse(
                    modelId=BEDROCK_MODEL_ID,
                    messages=[
                        {
                            "role": "user",
                            "content": [{"text": prompt}]
                        }
                    ],
                    system=[{"text": "You are a professional resume editor. Return ONLY valid JSON matching the resume schema."}],
                    inferenceConfig={"temperature": 0.1, "maxTokens": 4096}
                )
            except Exception as b_err:
                err_msg = str(b_err)
                if "AccessDeniedException" in err_msg or "access" in err_msg.lower():
                    return create_response(403, {"error": "Bedrock Model access denied. Ensure model access is enabled in your AWS console."})
                return create_response(502, {"error": f"Bedrock Converse API error: {err_msg}"})

            response_text = response["output"]["message"]["content"][0]["text"]
            
            # Extract JSON from output
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start != -1 and json_end != -1:
                updated_resume = json.loads(response_text[json_start:json_end])
            else:
                updated_resume = json.loads(response_text)

            # Save to /tmp
            tmp_path = f"/tmp/resumes/{filename}" if os.path.exists("/tmp") else f"resumes/{filename}"
            os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(updated_resume, f, indent=2)

            if os.path.exists("./resumes"):
                try:
                    with open(f"./resumes/{filename}", "w", encoding="utf-8") as f:
                        json.dump(updated_resume, f, indent=2)
                except Exception:
                    pass

            # Persist update to S3
            if BUCKET_NAME:
                try:
                    s3.put_object(
                        Bucket=BUCKET_NAME,
                        Key=s3_key,
                        Body=json.dumps(updated_resume, indent=2).encode("utf-8"),
                        ContentType="application/json"
                    )
                except Exception as s3_err:
                    print(f"Warning: Failed to persist updated resume to S3: {s3_err}")

            pdf_bytes = compile_typst(updated_resume, style)

            return create_response(200, {
                "status": "success",
                "version": v_name,
                "data": updated_resume,
                "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8")
            })


        # POST /commit (Push to GitHub)
        elif path == "/commit" and http_method == "POST":
            commit_msg = body.get("message", f"Update resume ({version}) via Serverless Resume Editor")
            if not GITHUB_TOKEN or not REPO_OWNER or not REPO_NAME:
                return create_response(400, {"error": "GitHub credentials not configured"})

            v_name, filename, s3_key = get_version_key(version)
            data = get_current_resume(version)
            content_b64 = base64.b64encode(json.dumps(data, indent=2).encode("utf-8")).decode("utf-8")

            github_path = f"resumes/{filename}"
            sha = ""
            url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{github_path}"
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
                    "version": v_name,
                    "pushed": True,
                    "commit": res_body.get("commit", {}).get("sha", "")
                })

        return create_response(404, {"error": f"Endpoint {path} not found"})

    except Exception as e:
        return create_response(500, {"error": str(e)})


