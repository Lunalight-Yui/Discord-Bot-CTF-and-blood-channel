FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

RUN mkdir -p /tmp/transcript-images \
    && chown -R node:node /app /tmp/transcript-images

USER node

# EXPOSE 3001

CMD ["node", "main.js"]