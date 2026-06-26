# Dockerfile for KML Processing API
# Optimized for Hugging Face Spaces deployment

FROM python:3.11-slim

# Set up environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=7860

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
WORKDIR /home/user/app

# Copy application code (initially as root)
COPY app/ .

# Create uploads folder (initially as root)
RUN mkdir -p uploads

# Change ownership of the entire /home/user directory to user 1000 (numeric IDs are safe)
RUN chown -R 1000:1000 /home/user

# Switch to non-root user 1000
USER 1000
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Expose port
EXPOSE 7860

# Run application
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT