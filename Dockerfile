FROM oven/bun:1.3 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
RUN bun install --frozen-lockfile

# Copy source
COPY . .

EXPOSE 3001

CMD ["bun", "run", "apps/server/src/index.ts"]
