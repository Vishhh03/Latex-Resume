FROM oven/bun:latest

# 1. Install system dependencies & Git
# Git is required for the initRepo() and commitToGit() functions
RUN apt-get update && apt-get install -y \
    curl \
    libfontconfig1 \
    libgraphite2-3 \
    libharfbuzz0b \
    libicu-dev \
    libssl-dev \
    libssl3 \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Tectonic (Fast LaTeX engine)
RUN curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh \
    && mv tectonic /usr/local/bin/

WORKDIR /app

# 3. Bun dependencies
# Copying only package.json first optimizes layer caching
COPY compute/package.json ./
RUN bun install

# 4. App Source & Base Resume
# Ensure the folder structure matches your Bun.file("resume.tex") calls
COPY compute/ ./compute/
COPY resume.tex .

# 5. Pre-warm Tectonic
# This is crucial for Fargate. It downloads the TeX bundles during build
# so the task doesn't fail or time out trying to download them at runtime.
RUN tectonic resume.tex && rm resume.pdf

# 6. Set production environment
ENV NODE_ENV=production

EXPOSE 8000

# Using the full path to main.ts based on your COPY command
CMD ["bun", "run", "compute/main.ts"]