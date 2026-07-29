FROM node:20-slim

# ffmpeg (for attp/anime sticker generation), a font (for attp's drawtext),
# and git (needed by npm to install git-based dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
