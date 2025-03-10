FROM node:18-slim

# Install required dependencies for Puppeteer and ffmpeg
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create and set permissions for sessions directory
RUN mkdir -p /app/sessions && chmod 777 /app/sessions

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV DISPLAY=:99

# Create a wrapper script to start Xvfb and the application
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1024x768x16 &\nnpm start' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Start the application using the wrapper script
CMD ["/app/start.sh"] 