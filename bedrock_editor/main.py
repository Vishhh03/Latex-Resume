import sys
import os
import argparse
from llm import generate_latex_update
from git_ops import git_commit_and_push

RESUME_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resume.tex")
BRANCH_NAME = "feature/bedrock-latex-editor"

def main():
    parser = argparse.ArgumentParser(description="AI-powered LaTeX Resume Editor")
    parser.add_argument("request", type=str, help="Natural language request for the resume update")
    parser.add_argument("--push", action="store_true", help="Automatically push changes to git")
    
    args = parser.parse_args()
    
    print(f"Reading resume from: {RESUME_PATH}")
    if not os.path.exists(RESUME_PATH):
        print("Error: resume.tex not found.")
        sys.exit(1)

    with open(RESUME_PATH, "r", encoding="utf-8") as f:
        current_latex = f.read()

    print("Sending request to Bedrock...")
    try:
        updated_latex = generate_latex_update(current_latex, args.request)
    except Exception as e:
        print(f"Failed to generate update: {e}")
        sys.exit(1)

    if not updated_latex:
        print("Error: Received empty response from LLM.")
        sys.exit(1)

    print("Updating resume.tex...")
    with open(RESUME_PATH, "w", encoding="utf-8") as f:
        f.write(updated_latex)

    print("Successfully updated resume.tex")

    if args.push:
        print("Pushing changes to git...")
        git_commit_and_push(BRANCH_NAME, f"AI Update: {args.request}")

if __name__ == "__main__":
    main()
