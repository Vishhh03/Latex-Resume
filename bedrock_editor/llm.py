import boto3
import json
import os

# Initialize Bedrock client
try:
    bedrock = boto3.client(service_name='bedrock-runtime', region_name='us-east-1')
except Exception as e:
    print(f"Error initializing Bedrock client: {e}")
    bedrock = None

MODEL_ID = "meta.llama3-70b-instruct-v1:0" 

def generate_latex_update(current_latex, user_request):
    """
    Sends the current LaTeX and user request to Llama 3 on Bedrock
    and returns the updated LaTeX code.
    """
    if not bedrock:
        raise Exception("Bedrock client is not initialized.")

    prompt = f"""
    <|begin_of_text|><|start_header_id|>system<|end_header_id|>
    You are an expert LaTeX developer. Your job is to modify a LaTeX resume based on the user's natural language request.
    
    RULES:
    1. Output ONLY the valid, compilable LaTeX code.
    2. Do NOT include markdown code blocks (```latex ... ```). Just the raw code.
    3. Maintain the existing structure and preamble completely unless asked to change it.
    4. Do not include any explanations or conversational text.
    
    <|eot_id|><|start_header_id|>user<|end_header_id|>
    Current LaTeX Resume:
    {current_latex}
    
    User Request:
    {user_request}
    
    Output the full updated LaTeX file:
    <|eot_id|><|start_header_id|>assistant<|end_header_id|>
    """

    body = json.dumps({
        "prompt": prompt,
        "max_gen_len": 2048,
        "temperature": 0.1,
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
        updated_latex = response_body.get('generation')
        
        # Cleanup if the model output markdown code blocks despite instructions
        if updated_latex.startswith("```latex"):
            updated_latex = updated_latex.replace("```latex", "").replace("```", "")
        if updated_latex.startswith("```"):
             updated_latex = updated_latex.replace("```", "")
             
        return updated_latex.strip()

    except Exception as e:
        print(f"Error invoking Bedrock model: {e}")
        raise e
