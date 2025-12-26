import os
import requests
import json
import base64

class GitHubClient:
    def __init__(self, repo_name=None, token=None):
        self.repo = repo_name or os.environ.get("GITHUB_REPO")
        self.token = token or os.environ.get("GITHUB_TOKEN")
        self.base_url = f"https://api.github.com/repos/{self.repo}"
        
        if not self.repo or not self.token:
            raise ValueError("GITHUB_REPO and GITHUB_TOKEN must be set.")
            
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }

    def get_file_content(self, file_path="resume.tex", branch="main"):
        url = f"{self.base_url}/contents/{file_path}?ref={branch}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        
        data = response.json()
        content = base64.b64decode(data['content']).decode('utf-8')
        sha = data['sha']
        return content, sha

    def update_file(self, file_path, content, sha, message, branch="main"):
        url = f"{self.base_url}/contents/{file_path}"
        
        body = {
            "message": message,
            "content": base64.b64encode(content.encode('utf-8')).decode('utf-8'),
            "sha": sha,
            "branch": branch,
            "committer": {
                "name": "AI Resume Editor",
                "email": "ai-bot@serverless.resume"
            }
        }
        
        response = requests.put(url, headers=self.headers, json=body)
        response.raise_for_status()
        return response.json()
