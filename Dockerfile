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
    dbus \
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

# Set up dbus configuration
RUN mkdir -p /var/run/dbus && \
    dbus-uuidgen > /var/lib/dbus/machine-id

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
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_TLS_REJECT_UNAUTHORIZED=0 \
    DISPLAY=:99 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/var/run/dbus/system_bus_socket \
    PORT=3000 \
    RAILWAY_VOLUME_MOUNT=/data \
    RAILWAY_STATIC_URL=$RAILWAY_STATIC_URL \
    NODE_ENV=production

# Create data directory for Railway persistent storage
RUN mkdir -p /data && chmod 777 /data

# Create a wrapper script to start dbus, Xvfb and the application
RUN echo '#!/bin/bash\n\
# Cleanup any existing processes\n\
pkill -f chrome\n\
pkill -f chromium\n\
pkill -f Xvfb\n\
pkill -f dbus-daemon\n\
\n\
# Remove any existing lock files\n\
rm -f /tmp/.X99-lock\n\
rm -f /var/run/dbus/pid\n\
\n\
# Setup DBus\n\
mkdir -p /var/run/dbus\n\
dbus-daemon --system --fork\n\
sleep 2\n\
\n\
# Setup display\n\
Xvfb :99 -screen 0 1280x900x16 -ac &\n\
sleep 2\n\
\n\
# Setup persistent storage\n\
if [ -d "/data/sessions" ]; then\n\
    echo "Using existing sessions from persistent storage"\n\
    rm -rf /app/sessions\n\
    ln -s /data/sessions /app/sessions\n\
else\n\
    echo "Creating new sessions directory in persistent storage"\n\
    mkdir -p /data/sessions\n\
    cp -r /app/sessions/* /data/sessions/ 2>/dev/null || true\n\
    rm -rf /app/sessions\n\
    ln -s /data/sessions /app/sessions\n\
fi\n\
\n\
# Ensure proper permissions\n\
chmod -R 777 /data/sessions\n\
chmod -R 777 /app/sessions\n\
\n\
# Start the application\n\
exec node index.js' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Start the application using the wrapper script
CMD ["/app/start.sh"] 