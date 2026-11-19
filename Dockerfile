FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev \
    && npm cache clean --force

COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8800

USER node

EXPOSE 8800

CMD ["npm", "start"]