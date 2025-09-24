FROM node:22.1-slim

ENV PORT=8080

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src src

RUN npm run build

CMD ["dist/app.js"]
