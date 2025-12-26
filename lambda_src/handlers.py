import json
import os
from github_client import GitHubClient
from llm import get_latex_patches
from patch_manager import apply_patches

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
        content, sha = client.get_file_content("resume.tex")
        
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
    Output: { "patches": [...] }
    """
    current_latex = event.get('current_latex')
    instruction = event.get('instruction')
    
    patches = get_latex_patches(current_latex, instruction)
    
    return patches # Return list directly

def commit_update(event, context):
    """
    Step 3: Apply patches and commit.
    Input: { "patches": [...], "current_latex": "...", "sha": "...", "instruction": "..." }
    """
    patches = event.get('patches')
    current_latex = event.get('current_latex')
    sha = event.get('sha')
    instruction = event.get('instruction')
    
    # Apply
    new_latex, success, msg = apply_patches(current_latex, patches)
    
    if not success:
        raise Exception(f"Failed to apply patches: {msg}")
        
    # Commit
    client = GitHubClient()
    client.update_file(
        file_path="resume.tex",
        content=new_latex,
        sha=sha,
        message=f"Update resume (AI): {instruction[:30]}..."
    )
    
    return {
        "status": "success",
        "message": "Resume updated and committed."
    }
