# Dockerfile for KML Processing API
# Optimized for Hugging Face Spaces deployment

FROM python:3.11-slim

# Set up environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=7860 \
    HOME=/home/user

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user (Hugging Face Spaces runs as user 1000)
RUN useradd -m -u 1000 user

# Set working directory for requirements installation (run as root)
WORKDIR /build

# Copy requirements and install packages globally (as root)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set up application directory
WORKDIR $HOME/app

# Switch to non-root user (subsequent commands run as user 1000)
USER user
ENV PATH=/home/user/.local/bin:$PATH

# Copy application code with correct ownership (1000:1000)
COPY --chown=1000:1000 app/ .

# Create upload directory (owned by user since we are running as user)
RUN mkdir -p uploads

# Expose port
EXPOSE 7860

# Run application
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT