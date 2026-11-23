FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js db.js audit.js logic.js thresholds.js seed-users.js ./
COPY auth ./auth
COPY realtime ./realtime

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "start"]
