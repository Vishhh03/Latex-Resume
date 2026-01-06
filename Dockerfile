# =============================================================================
# Stage 1: Build Next.js Frontend (Static Export)
# =============================================================================
FROM oven/bun:latest AS frontend

WORKDIR /frontend

# Install dependencies first (better caching)
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source and build
COPY web/ ./

# Build static export
RUN bun run build

# =============================================================================
# Stage 2: Production Runtime
# =============================================================================
FROM oven/bun:latest

# Install system dependencies & Git & cloudflared & TeX Live
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    # TeX Live for pdflatex
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-plain-generic \
    texlive-science \
    texlive-pictures \
    latexmk \
    lmodern \
    && rm -rf /var/lib/apt/lists/* \
    && updmap-sys

# Install cloudflared
RUN curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

WORKDIR /app

# Bun dependencies for backend
COPY compute/package.json ./
RUN bun install

# Copy backend source
COPY compute/ ./compute/

# Copy base resume
COPY resume.tex .

# Copy built frontend (static files)
COPY --from=frontend /frontend/out ./public

# Skip pre-compilation (done at runtime on first request)

# Initialize git repo (required for commit functionality)
RUN git init && \
    git config user.email "vishshaji03@gmail.com" && \
    git config user.name "Vishal Shaji" && \
    git add resume.tex && \
    git commit -m "Initial resume"

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Set production environment
ENV NODE_ENV=production

EXPOSE 8000

# Use entrypoint script to start both cloudflared and backend
CMD ["./entrypoint.sh"]