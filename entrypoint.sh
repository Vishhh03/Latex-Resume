#!/bin/bash
set -e

echo "🚀 Starting Resume Backend with Cloudflare Tunnel..."

# Configure git for commits and push
git config --global user.email "vishshaji03@gmail.com"
git config --global user.name "Vishal Shaji"
git config --global --add safe.directory /app

# Configure GitHub credentials if PAT is provided
if [ -n "$GITHUB_TOKEN" ]; then
    echo "🔑 Configuring GitHub credentials..."
    git config --global credential.helper store
    echo "https://Vishhh03:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
    # Update remote to use HTTPS with token
    git remote set-url origin "https://Vishhh03:${GITHUB_TOKEN}@github.com/Vishhh03/Latex-Resume.git" 2>/dev/null || true
fi

# Start cloudflared tunnel in background (if token is provided)
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
    echo "🌐 Starting Cloudflare Tunnel..."
    cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
    TUNNEL_PID=$!
    echo "🌐 Cloudflare Tunnel started (PID: $TUNNEL_PID)"
else
    echo "⚠️  No CLOUDFLARE_TUNNEL_TOKEN provided, skipping tunnel"
fi

# Start the backend (this will also serve the static frontend)
echo "🔧 Starting Bun backend..."
exec bun run compute/main.ts
