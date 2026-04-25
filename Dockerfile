# Use Node.js slim image as base
FROM node:20-bullseye-slim

# Install Python, pip, ffmpeg, and build tools
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using pip (this makes it available system-wide)
RUN pip3 install --no-cache-dir --upgrade yt-dlp

# Verify yt-dlp is installed
RUN yt-dlp --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
