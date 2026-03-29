# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine

RUN apk add --no-cache tini

# Install dotenvx globally for the CLI runner
RUN npm install -g @dotenvx/dotenvx

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy encrypted .env files (decrypted at runtime via DOTENV_PRIVATE_KEY)
COPY .env* ./

# Data directory for state + tokens
RUN mkdir -p /data
ENV DATA_DIR=/data
VOLUME /data

USER node
EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["dotenvx", "run", "--", "node", "dist/index.js"]
