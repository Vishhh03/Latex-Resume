import json
import os

# Default values
DEFAULT_CONFIG = {
    "bedrock_region": "us-east-1",
    "model_id": "llama-4-scout",
    "resume_filename": "resume.tex"
}

def load_config():
    """Load configuration from config.json, falling back to defaults."""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                user_config = json.load(f)
                return {**DEFAULT_CONFIG, **user_config}
        except Exception as e:
            print(f"Error loading config.json: {e}")
            return DEFAULT_CONFIG
    
    return DEFAULT_CONFIG

# Load config once at module level
_config = load_config()

BEDROCK_REGION = _config.get("bedrock_region")
MODEL_ID = _config.get("model_id")# DynamoDB
DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'ConversationsTable')
RESUME_FILENAME = _config.get("resume_filename")

if __name__ == "__main__":
    print(f"BEDROCK_REGION: {BEDROCK_REGION}")
    print(f"MODEL_ID: {MODEL_ID}")
    print(f"RESUME_FILENAME: {RESUME_FILENAME}")
