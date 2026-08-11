import json
import re
import base64
import boto3
import os
import urllib.request


class ResumeAgent:
    """
    Truly Helpful Resume Agent: An autonomous multi-tool agent that analyzes target job descriptions,
    scores ATS keyword alignment, applies targeted JSON section edits, compiles & verifies Typst PDF layout,
    and self-corrects visual overflow constraints.
    """

    def __init__(self, bedrock_client=None, bedrock_model_id=None, compile_func=None):
        self.bedrock = bedrock_client
        self.model_id = bedrock_model_id or os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-micro-v1:0")
        self.compile_func = compile_func
        self.trace_log = []

    def log_action(self, tool_name, status, details):
        self.trace_log.append({
            "tool": tool_name,
            "status": status,
            "details": details
        })

    def analyze_job_description(self, job_description):
        """Tool: Extracts key tech stack, domain terms, and required skills from a job posting."""
        if not job_description or not job_description.strip():
            return {"keywords": [], "categories": {}}

        # Clean text & tokenize words/phrases
        cleaned = re.sub(r'[^\w\s\+#\.\-]', ' ', job_description)
        words = [w.strip() for w in cleaned.split() if len(w.strip()) > 1]
        
        # Tech & Engineering keyword dictionary for extraction
        tech_dictionary = [
            "python", "aws", "lambda", "typst", "terraform", "docker", "kubernetes", "react", "next.js",
            "node.js", "typescript", "javascript", "golang", "rust", "java", "c++", "postgresql", "mongodb",
            "redis", "s3", "bedrock", "llm", "ai", "ci/cd", "github actions", "rest api", "graphql", "microservices",
            "serverless", "cloud", "security", "oidc", "iam", "unit testing", "pytest", "devops", "system design"
        ]

        found_keywords = set()
        for word in words:
            w_lower = word.lower()
            if w_lower in tech_dictionary or len(w_lower) > 3:
                if w_lower not in ["with", "that", "this", "from", "have", "will", "your", "must", "work", "team"]:
                    found_keywords.add(w_lower)

        kw_list = sorted(list(found_keywords))[:25]
        result = {
            "keywords": kw_list,
            "total_extracted": len(kw_list)
        }
        self.log_action("analyze_job_description", "SUCCESS", f"Extracted {len(kw_list)} key skills & terms from JD.")
        return result

    def calculate_ats_alignment(self, resume_data, keywords):
        """Tool: Calculates ATS match percentage and lists matched vs missing keywords."""
        if not keywords:
            return {"score": 100, "matched": [], "missing": []}

        resume_str = json.dumps(resume_data).lower()
        matched = []
        missing = []

        for kw in keywords:
            if kw.lower() in resume_str:
                matched.append(kw)
            else:
                missing.append(kw)

        total = len(keywords)
        score = int((len(matched) / total) * 100) if total > 0 else 100
        
        result = {
            "score": score,
            "matched_keywords": matched,
            "missing_keywords": missing,
            "total_keywords": total
        }
        self.log_action("calculate_ats_alignment", "SUCCESS", f"ATS Score: {score}% ({len(matched)}/{total} matched)")
        return result

    def update_resume_section(self, resume_data, section, content):
        """Tool: Performs targeted modifications to a specific resume section."""
        updated = json.loads(json.dumps(resume_data)) # deep copy
        if section in updated:
            updated[section] = content
            self.log_action("update_resume_section", "SUCCESS", f"Updated section '{section}' with new content.")
        else:
            updated[section] = content
            self.log_action("update_resume_section", "CREATED", f"Created section '{section}'.")
        return updated

    def compile_and_verify_layout(self, resume_data):
        """
        Tool: Compiles Typst PDF and inspects document formatting metrics.
        Verifies 1-page fit constraint and absence of compilation errors.
        """
        if not self.compile_func:
            self.log_action("compile_and_verify_layout", "SKIPPED", "No compile function provided.")
            return {"status": "success", "page_count": 1, "size_bytes": 0}

        try:
            pdf_bytes = self.compile_func(resume_data)
            pdf_size = len(pdf_bytes)
            
            # Precise PDF page object count inspection
            page_objects = len(re.findall(rb'/Type\s*/Page\b', pdf_bytes))
            page_count = page_objects if page_objects > 0 else 1

            if b"/Count 2" in pdf_bytes or b"/Count 3" in pdf_bytes:
                page_count = max(page_count, 2)
            elif page_objects == 0 and pdf_size > 250000:
                page_count = 2

            is_valid = page_count == 1
            status = "PASSED" if is_valid else "OVERFLOW"

            
            self.log_action("compile_and_verify_layout", status, 
                            f"Compiled PDF ({pdf_size} bytes). Estimated pages: {page_count}. 1-Page constraint: {is_valid}")

            return {
                "status": "success",
                "pdf_bytes": pdf_bytes,
                "pdf_size": pdf_size,
                "page_count": page_count,
                "fits_single_page": is_valid
            }
        except Exception as e:
            self.log_action("compile_and_verify_layout", "COMPILATION_ERROR", str(e))
            return {"status": "error", "error": str(e), "fits_single_page": False}

    def call_byok_llm(self, prompt, byok=None):
        """
        Tool: Invokes custom BYOK LLM providers (OpenAI, Anthropic, OpenRouter, Custom Bedrock Credentials).
        Uses native urllib.request to avoid third-party pip dependencies in Lambda.
        """
        byok = byok or {}
        provider = (byok.get("provider") or "bedrock").lower()
        api_key = (byok.get("api_key") or "").strip()
        model_id = (byok.get("model_id") or "").strip()

        if provider in ["openai", "openrouter"]:
            endpoint = "https://api.openai.com/v1/chat/completions" if provider == "openai" else "https://openrouter.ai/api/v1/chat/completions"
            model = model_id or ("gpt-4o-mini" if provider == "openai" else "deepseek/deepseek-r1")
            
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a professional resume architect. Return ONLY valid JSON matching the schema."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1
            }
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            if provider == "openrouter":
                headers["HTTP-Referer"] = "https://github.com/Vishhh03/Latex-Resume"
                headers["X-Title"] = "Serverless Typst Resume Agent"

            req = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                return res_data["choices"][0]["message"]["content"]

        elif provider == "anthropic":
            model = model_id or "claude-3-5-sonnet-20241022"
            payload = {
                "model": model,
                "max_tokens": 4096,
                "system": "You are a professional resume architect. Return ONLY valid JSON matching the schema.",
                "messages": [{"role": "user", "content": prompt}]
            }
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(payload).encode("utf-8"), headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            })
            with urllib.request.urlopen(req) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                return res_data["content"][0]["text"]

        elif provider in ["google", "gemini"]:
            model = model_id or "gemini-1.5-flash"
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            
            payload = {
                "system_instruction": {
                    "parts": [{"text": "You are a professional resume architect. Return ONLY valid JSON matching the schema."}]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt}]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json"
                }
            }
            
            req = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers={
                "Content-Type": "application/json"
            })
            with urllib.request.urlopen(req) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                return res_data["candidates"][0]["content"]["parts"][0]["text"]


        elif provider == "bedrock":
            aws_key = byok.get("aws_access_key", "")
            aws_secret = byok.get("aws_secret_key", "")
            aws_region = byok.get("aws_region", os.environ.get("AWS_REGION", "us-east-1"))

            client = self.bedrock
            if aws_key and aws_secret:
                client = boto3.client("bedrock-runtime", region_name=aws_region, aws_access_key_id=aws_key, aws_secret_access_key=aws_secret)

            if not client:
                raise Exception("No Bedrock client configured.")

            target_model = model_id or self.model_id
            response = client.converse(
                modelId=target_model,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                system=[{"text": "You are a professional resume architect. Return ONLY valid JSON matching the schema."}],
                inferenceConfig={"temperature": 0.1, "maxTokens": 4096}
            )
            return response["output"]["message"]["content"][0]["text"]
        else:
            raise Exception(f"Unsupported BYOK provider: {provider}")

    def run_agentic_workflow(self, initial_resume, instruction, job_description="", byok=None):
        """
        Main Agent Execution Loop with BYOK Support:
        1. Analyzes JD & extracts required keywords.
        2. Calculates initial ATS score.
        3. Uses LLM (Bedrock, OpenAI, Anthropic, OpenRouter) to edit & optimize missing skills/highlights.
        4. Compiles PDF & verifies layout (ensuring strict 1-page constraint).
        5. If overflow occurs, automatically trims long highlights until 1-page fit is achieved.
        6. Calculates final ATS score and returns audit package.
        """
        self.trace_log = []
        byok = byok or {}
        provider_name = (byok.get("provider") or ("bedrock" if self.bedrock else "fallback_engine")).upper()
        self.log_action("start_session", "STARTED", f"Instruction: {instruction} | Provider: {provider_name}")

        # Step 1: Analyze Job Description
        jd_analysis = self.analyze_job_description(job_description)
        keywords = jd_analysis["keywords"]

        # Step 2: Initial ATS Score
        initial_ats = self.calculate_ats_alignment(initial_resume, keywords)

        # Step 3: Optimization via BYOK LLM or Fallback Logic
        current_resume = json.loads(json.dumps(initial_resume))
        
        has_llm_credentials = (
            (byok.get("api_key")) or 
            (byok.get("provider") == "bedrock" or (not byok.get("provider") and self.bedrock))
        )

        if has_llm_credentials and keywords and initial_ats["missing_keywords"]:
            try:
                missing_str = ", ".join(initial_ats["missing_keywords"][:8])
                prompt = (
                    f"You are an autonomous Resume Architect Agent.\n"
                    f"Instruction: {instruction}\n"
                    f"Target Keywords to incorporate naturally: {missing_str}\n\n"
                    f"Current JSON Resume:\n{json.dumps(current_resume, indent=2)}\n\n"
                    f"Output strictly updated JSON adhering to the resume schema. Ensure high ATS impact while keeping content concise to fit on 1 page."
                )
                
                res_text = self.call_byok_llm(prompt, byok)
                s_idx = res_text.find("{")
                e_idx = res_text.rfind("}") + 1
                if s_idx != -1 and e_idx != -1:
                    updated_candidate = json.loads(res_text[s_idx:e_idx])
                    if isinstance(updated_candidate, dict) and "basics" in updated_candidate:
                        current_resume = updated_candidate
                        self.log_action("llm_optimization", "SUCCESS", f"LLM ({provider_name}) successfully updated resume.")
            except Exception as e:
                self.log_action("llm_optimization", "FALLBACK", f"LLM optimization deferred to tool engine: {e}")


        # If LLM didn't run or fallback, append missing keywords directly to Skills section if missing
        if initial_ats["missing_keywords"]:
            skills = current_resume.get("skills", [])
            existing_kw_list = []
            for s in skills:
                if isinstance(s, dict):
                    existing_kw_list.extend([k for k in s.get("keywords", []) if isinstance(k, str)])
                elif isinstance(s, str):
                    existing_kw_list.append(s)
            
            new_to_add = [kw for kw in initial_ats["missing_keywords"][:5] if kw.lower() not in [e.lower() for e in existing_kw_list if isinstance(e, str)]]
            if new_to_add:
                if isinstance(skills, list):
                    skills.append({"name": "Target Job Keywords", "keywords": new_to_add})
                    current_resume = self.update_resume_section(current_resume, "skills", skills)


        # Step 4: Closed-Loop Layout Verification & Self-Correction
        layout = self.compile_and_verify_layout(current_resume)
        
        # Self-correction loop if overflow occurs
        attempts = 0
        while not layout.get("fits_single_page", True) and attempts < 2:
            attempts += 1
            self.log_action("self_correction", "TRIMMING", f"Attempt {attempts}: Trimming highlights to fit single-page constraint.")
            
            # Trim highlights across work experiences
            for w in current_resume.get("work", []):
                if len(w.get("highlights", [])) > 2:
                    w["highlights"] = w["highlights"][:2]
            
            layout = self.compile_and_verify_layout(current_resume)

        # Step 5: Final ATS Score
        final_ats = self.calculate_ats_alignment(current_resume, keywords)

        pdf_b64 = ""
        if layout.get("pdf_bytes"):
            pdf_b64 = base64.b64encode(layout["pdf_bytes"]).decode("utf-8")

        self.log_action("finalize_session", "COMPLETED", f"Final ATS Score: {final_ats['score']}%. Single-page fit: {layout.get('fits_single_page', True)}")

        return {
            "status": "success",
            "data": current_resume,
            "pdf_base64": pdf_b64,
            "ats_score_before": initial_ats["score"],
            "ats_score_after": final_ats["score"],
            "matched_keywords": final_ats["matched_keywords"],
            "missing_keywords": final_ats["missing_keywords"],
            "layout_verification": {
                "page_count": layout.get("page_count", 1),
                "fits_single_page": layout.get("fits_single_page", True),
                "pdf_size": layout.get("pdf_size", 0)
            },
            "trace_log": self.trace_log
        }
