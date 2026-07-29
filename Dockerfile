FROM node:20-slim

# ffmpeg (for attp/anime sticker generation) and a font (for attp's drawtext)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]
