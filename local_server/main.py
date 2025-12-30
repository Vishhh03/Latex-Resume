import sys
import os
import json
import uuid
import subprocess
import shutil
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add lambda_src to path to reuse logic
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'lambda_src'))

from llm import get_latex_patches
from patch_manager import apply_patches
from config import RESUME_FILENAME

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESUME_PATH = os.path.join(BASE_DIR, RESUME_FILENAME)
HISTORY_FILE = os.path.join(BASE_DIR, "local_history.json")

# --- Helpers ---

def get_history():
    if not os.path.exists(HISTORY_FILE):
        return {}
    with open(HISTORY_FILE, 'r') as f:
        return json.load(f)

def save_history(history):
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=2)

def add_turn(conversation_id, instruction, patches):
    history = get_history()
    if conversation_id not in history:
        history[conversation_id] = []
    
    # Matches DynamoDB structure roughly
    history[conversation_id].append({"role": "user", "content": instruction})
    history[conversation_id].append({"role": "assistant", "content": json.dumps(patches)})
    save_history(history)

# --- Models ---

class UpdateRequest(BaseModel):
    instruction: str
    conversation_id: Optional[str] = None
    job_description: Optional[str] = None

class PreviewRequest(BaseModel):
    latex: Optional[str] = None

class SaveRequest(BaseModel):
    latex: str
    message: Optional[str] = "Saved locally"

# --- Endpoints ---

@app.get("/resume")
def get_resume():
    if not os.path.exists(RESUME_PATH):
        raise HTTPException(status_code=404, detail="Resume file not found")
    with open(RESUME_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    return content

@app.post("/preview")
def preview_resume(request: PreviewRequest):
    # If latex provided, use it. Else use file content.
    latex_content = request.latex
    if not latex_content:
        # Use existing file
        with open(RESUME_PATH, 'r', encoding='utf-8') as f:
            latex_content = f.read()
            
    # Compile
    # We'll use a unique ID for temp files to allow concurrent requests
    job_id = str(uuid.uuid4())
    temp_dir = os.path.join(BASE_DIR, "temp_builds")
    os.makedirs(temp_dir, exist_ok=True)
    
    tex_file = os.path.join(temp_dir, f"{job_id}.tex")
    
    with open(tex_file, 'w', encoding='utf-8') as f:
        f.write(latex_content)
        
    try:
        # Run tectonic
        subprocess.run(["tectonic", tex_file], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        pdf_file = os.path.join(temp_dir, f"{job_id}.pdf")
        
        if not os.path.exists(pdf_file):
            raise Exception("PDF file not generated")
            
        return FileResponse(pdf_file, media_type="application/pdf", filename="resume.pdf")
        
    except subprocess.CalledProcessError as e:
        return JSONResponse(status_code=500, content={
            "error": "Compilation Failed",
            "details": e.stderr.decode('utf-8')
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/update")
def update_resume(request: UpdateRequest):
    conversation_id = request.conversation_id or str(uuid.uuid4())
    
    try:
        # 1. Read current LaTeX
        with open(RESUME_PATH, 'r', encoding='utf-8') as f:
            current_latex = f.read()
            
        # 2. Get History
        full_history = get_history()
        history = full_history.get(conversation_id, [])
        
        # 3. Call LLM (Bedrock)
        # Note: This uses the AWS credentials on the machine
        patches = get_latex_patches(current_latex, request.instruction, history, request.job_description)
        
        # 4. Apply patches
        new_latex = apply_patches(current_latex, patches)
        
        # 5. Save to file (LOCAL MODE: We overwrite the file directly!)
        with open(RESUME_PATH, 'w', encoding='utf-8') as f:
            f.write(new_latex)
            
        # 6. Save History
        add_turn(conversation_id, request.instruction, patches)
        
        return {
            "conversation_id": conversation_id,
            "status": "success",
            "patches": patches
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
def list_history():
    # Return mocked commit history for now, or the conversation logs?
    # The frontend expects git commits. 
    # For local mode, we might just return the local file stats or a placeholder.
    return [
        {
            "sha": "local",
            "message": "Current Local Version",
            "date": "Now",
            "author": "You"
        }
    ]

@app.post("/save")
def save_resume(request: SaveRequest):
    try:
        with open(RESUME_PATH, 'w', encoding='utf-8') as f:
            f.write(request.latex)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
