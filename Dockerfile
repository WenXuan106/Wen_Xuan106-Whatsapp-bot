FROM node:20-slim

# ffmpeg (for attp/anime sticker generation), a font (for attp's drawtext),
# and git (needed because @whiskeysockets/baileys pulls libsignal from a
# GitHub URL rather than the npm registry)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    git \
    && rm -rf /var/lib/apt/lists/*

# Force git to fetch GitHub repos over HTTPS instead of SSH, since this
# container has no SSH key and doesn't need one for a public repo
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
