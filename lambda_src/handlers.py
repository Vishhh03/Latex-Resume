import json
import os
from github_client import GitHubClient
from llm import get_latex_patches
from patch_manager import apply_patches
from config import RESUME_FILENAME
import history_manager
import uuid

def lambda_handler(event, context):
    """
    Entry point for API Gateway Trigger.
    Just passes the instruction to the Step Function (in a real scenario, API Gateway connects directly to Step Function).
    If this is used as a proxy, we parse the body.
    """
    if 'body' in event:
        body = json.loads(event['body'])
        return body
    return event

def fetch_resume(event, context):
    """
    Step 1: Fetch resume content from GitHub.
    Input: { "instruction": "..." } (from API/Start)
    Output: { "content": "...", "sha": "...", "instruction": "..." }
    """
    try:
        # If event comes from API Gateway V2/REST directly to SF, the input format helps.
        # We assume input is just the JSON state passed down.
        
        instruction = event.get('instruction')
        # If invoked via API Gateway Proxy integration mapping, might allow different structure
        # But let's assume direct payload.
        
        client = GitHubClient()
        content, sha = client.get_file_content(RESUME_FILENAME)
        
        return {
            "content": content,
            "sha": sha,
            "instruction": instruction
        }
    except Exception as e:
        raise e

def generate_diff(event, context):
    """
    Step 2: Generate patches using Bedrock.
    Input: { "current_latex": "...", "instruction": "..." }
    Output: { "patches": [...], "conversation_id": "..." }
    """
    instruction = event.get('instruction')
    current_latex = event.get('current_latex')
    conversation_id = event.get('conversation_id')
    
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
        print(f"Generated new conversation_id: {conversation_id}")

    if not instruction or not current_latex:
        raise ValueError("Missing instruction or current_latex")
        
    # Get history
    history = history_manager.get_history(conversation_id)
    
    # Get job description if provided
    job_description = event.get('job_description')

    # Get patches from LLM
    patches = get_latex_patches(current_latex, instruction, history, job_description)
    
    # Save the turn to history
    # We save THE INSTRUCTION (User) and THE PATCHES (Assistant)
    # This keeps the history clean with instructions and actions.
    history_manager.add_turn(conversation_id, instruction, patches)

    return {
        "patches": patches,
        "conversation_id": conversation_id
    }

def commit_update(event, context):
    """
    Step 3: Apply patches and commit.
    Input: { "patches": [...], "current_latex": "...", "sha": "...", "instruction": "..." }
    """
    patches = event.get('patches')
    current_latex = event.get('current_latex')
    sha = event.get('sha')
    instruction = event.get('instruction')
    conversation_id = event.get('conversation_id')

    if not patches or not current_latex or not sha:
        raise ValueError("Missing patches, current_latex, or sha")
        
    # Apply patches
    new_latex = apply_patches(current_latex, patches)
    
    # Commit to GitHub
    # Assuming GITHUB_TOKEN and GITHUB_REPO are defined elsewhere or will be added
    client = GitHubClient(os.environ.get('GITHUB_TOKEN'), os.environ.get('GITHUB_REPO'))
    new_sha = client.update_file(
        file_path=RESUME_FILENAME,
        content=new_latex,
        commit_message=f"AI Update: {instruction}",
        sha=sha
    )
    
    return {
        "status": "success",
        "new_sha": new_sha,
        "conversation_id": conversation_id
    }

def get_history_handler(event, context):
    """
    Returns list of commits for the resume file.
    Input: {} (GET /history)
    """
    try:
        client = GitHubClient()
        commits = client.list_commits()
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps(commits)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

def get_resume_handler(event, context):
    """
    Returns the raw content of the resume, optionally at a specific commit ref.
    Input: queryStringParameters: { ref: "sha" } (GET /resume)
    """
    try:
        ref = None
        if event.get('queryStringParameters'):
            ref = event['queryStringParameters'].get('ref')
            
        client = GitHubClient()
        content, sha = client.get_file_content(RESUME_FILENAME, ref=ref)
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/plain" 
            },
            "body": content
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

def save_resume_handler(event, context):
    """
    Saves raw LaTeX content to GitHub.
    Input: body: { latex: "...", message: "Manual update" } (POST /save)
    """
    try:
        body = json.loads(event.get('body', '{}'))
        content = body.get('latex')
        message = body.get('message', 'Manual update via Editor')
        
        if not content:
            return {"statusCode": 400, "body": "Missing 'latex'"}

        client = GitHubClient()
        # 1. Get current SHA
        _, sha = client.get_file_content(RESUME_FILENAME)
        
        # 2. Update file
        result = client.update_file(RESUME_FILENAME, content, sha, message)
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps(result)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
