FROM node:22-bookworm-slim AS base

# libvips (with libheif) for sharp HEIC decode, ffmpeg for video posters,
# perl for the vendored exiftool binary, build tools for native modules
# (better-sqlite3, sharp) during npm install.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    ffmpeg \
    perl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips \
    ffmpeg \
    perl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production
ENV PHOTOS_ROOT=/photos

EXPOSE 3000
CMD ["node", "dist/index.js"]
