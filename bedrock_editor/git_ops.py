import subprocess
import sys

def git_commit_and_push(branch_name, message):
    """
    Staps, commits, and pushes changes to the specified branch.
    """
    try:
        # Add all changes
        subprocess.run(["git", "add", "."], check=True)
        print("Staged all changes.")

        # Commit
        subprocess.run(["git", "commit", "-m", message], check=True)
        print(f"Committed changes with message: {message}")

        # Push
        subprocess.run(["git", "push", "origin", branch_name], check=True)
        print(f"Pushed changes to {branch_name}")

    except subprocess.CalledProcessError as e:
        print(f"Error during git operation: {e}")
        sys.exit(1)
