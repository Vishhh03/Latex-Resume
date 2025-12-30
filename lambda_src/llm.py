import boto3
import json
import os
from config import BEDROCK_REGION, MODEL_ID

# Initialize Bedrock client
try:
    bedrock = boto3.client(service_name='bedrock-runtime', region_name=BEDROCK_REGION)
except Exception as e:
    print(f"Error initializing Bedrock client: {e}")
    bedrock = None



def get_latex_patches(current_latex, user_request, history=[], job_description=None):
    """
    Sends the current LaTeX, user request, and conversation history to Llama 4 Scout.
    Returns a list of search/replace patches in JSON format.
    """
    if not bedrock:
        raise Exception("Bedrock client is not initialized.")

    # Optimize history for context window (16k limit)
    MAX_HISTORY_MSGS = 10
    MAX_HISTORY_CHARS = 32000

    # 1. Sliding window (last N messages)
    if len(history) > MAX_HISTORY_MSGS:
        history = history[-MAX_HISTORY_MSGS:]

    # 2. Token/Char limit truncation
    final_history = []
    current_chars = 0
    
    for msg in reversed(history):
        content = msg.get('content', '')
        # Approximate check (content + role overhead)
        msg_len = len(content) + 50 
        
        if current_chars + msg_len > MAX_HISTORY_CHARS:
            break
            
        final_history.insert(0, msg)
        current_chars += msg_len
    
    history = final_history

    # Format history
    history_block = ""
    for msg in history:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        history_block += f"<|start_header_id|>{role}<|end_header_id|>\n{content}\n<|eot_id|>\n"

    jd_instruction = ""
    if job_description:
        jd_instruction = f"""
        JOB DESCRIPTION:
        {job_description}
        
        TASK:
        Tailor the resume to match the keywords, skills, and requirements from the above JOB DESCRIPTION.
        Highlight relevant experience and remove irrelevant details to align with this specific role.
        """

    prompt = f"""
    <|begin_of_text|><|start_header_id|>system<|end_header_id|>
    You are an expert LaTeX developer. Your job is to modify a LaTeX resume based on the user's natural language request.
    
    IMPORTANT: You must NOT return the full file. You must return a list of SEARCH and REPLACE blocks in JSON format.
    The goal is to modify the file by finding exact unique text blocks and replacing them.
    
    RULES:
    1. Output strictly a valid JSON list of objects.
    2. Each object must have "search" and "replace" keys.
    3. 'search': A unique block of text from the original file that needs to be replaced. MUST MATCH EXACTLY (whitespace, indentation).
    4. 'replace': The new text that will replace the 'search' block.
    5. Include enough context in 'search' to ensure it is unique.
    6. Minimum indentation and formatting must be preserved or intentionally updated in 'replace'.
    
    CRITICAL INSTRUCTIONS:
    - **ONE-PAGE ENFORCER**: Prioritize brevity. Ensure the generated content is concise enough to fit on a single page. Remove older or less relevant experience if necessary to save space.
    {jd_instruction}
    
    CAVEATS & COMPATIBILITY:
    - This project uses the 'Tectonic' engine. AVOID unsupported packages or shell-escape commands.
    - DO NOT use \\fontspec unless absolutely necessary; Tectonic handles fonts differently.
    - Be careful with nested list environments inside specialized commands (like \\cventry). Ensure \\begin{{itemize}} is wrapped in braces {{}} if inside a command argument.
    - DO NOT remove the document preamble or structual commands like \\documentclass.
    - When rewriting bullets, stick to \\item ... without manual bullet symbols if using moderncv theme defaults, OR use \\textbullet explicitly if requested.
    
    Example Output:
    [
        {{
            "search": "\\\\name{{Old}}{{Name}}",
            "replace": "\\\\name{{New}}{{Name}}"
        }}
    ]

    <|eot_id|>
    
    {history_block}

    <|start_header_id|>user<|end_header_id|>
    Current LaTeX Resume:
    {current_latex}
    
    User Request:
    {user_request}
    
    Output the JSON patches:
    <|eot_id|><|start_header_id|>assistant<|end_header_id|>
    """

    body = json.dumps({
        "prompt": prompt,
        "max_gen_len": 2048,
        "temperature": 0.0, # Low temperature for precision
        "top_p": 0.9,
    })

    try:
        response = bedrock.invoke_model(
            body=body,
            modelId=MODEL_ID,
            accept='application/json',
            contentType='application/json'
        )
        
        response_body = json.loads(response.get('body').read())
        output_text = response_body.get('generation').strip()
        
        # Cleanup if the model output markdown code blocks
        if "```json" in output_text:
            output_text = output_text.split("```json")[1].split("```")[0].strip()
        elif "```" in output_text:
             output_text = output_text.replace("```", "").strip()
             
        patches = json.loads(output_text)
        return patches

    except json.JSONDecodeError:
        print(f"Failed to decode JSON from model output: {output_text}")
        raise Exception("Model did not return valid JSON.")
    except Exception as e:
        print(f"Error invoking Bedrock model: {e}")
        raise e
