# Stage 1: Build & Setup Tectonic
FROM python:3.11-slim as base

# Install system dependencies for Tectonic and PDF processing
RUN apt-get update && apt-get install -y \
    curl \
    libfontconfig1 \
    libgraphite2-3 \
    libharfbuzz0b \
    libicu-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Tectonic (Fast LaTeX engine)
RUN curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net |sh
RUN mv tectonic /usr/local/bin/

# Set up working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY compute/ ./compute/
COPY resume.tex .

# --- CRITICAL: Warmup Tectonic Cache ---
# We run Tectonic once during build so it downloads the base LaTeX packages.
# This makes the "Cold Start" in Fargate 10x faster.
RUN tectonic resume.tex && rm resume.pdf

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI with Uvicorn
CMD ["python", "compute/main.py"]