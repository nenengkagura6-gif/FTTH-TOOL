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

# Set working directory for requirements installation
WORKDIR /build

# Copy requirements and install packages globally (as root)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create a non-root user (Hugging Face Spaces runs as user 1000)
RUN useradd -m -u 1000 user

# Set up application directory
WORKDIR $HOME/app

# Copy application code and set ownership
COPY app/ .
RUN chown -R user:user $HOME/app

# Create upload directory (writable by user)
RUN mkdir -p $HOME/app/uploads && chown -R user:user $HOME/app/uploads

# Expose port
EXPOSE 7860

# Switch to non-root user
USER user
ENV PATH=/home/user/.local/bin:$PATH

# Run application
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT