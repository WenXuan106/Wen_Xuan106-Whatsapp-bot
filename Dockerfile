FROM node:20-slim

# ffmpeg (for attp/anime sticker generation), a font (for attp's drawtext),
# git + ca-certificates (needed because @whiskeysockets/baileys pulls
# libsignal from a GitHub URL over HTTPS, which requires a CA bundle to
# verify github.com's certificate)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Force git to fetch GitHub repos over HTTPS instead of SSH, since this
# container has no SSH key and doesn't need one for a public repo
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
