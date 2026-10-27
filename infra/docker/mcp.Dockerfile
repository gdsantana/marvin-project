FROM node:24.22.0-bookworm-slim
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile
COPY apps/mcp apps/mcp
COPY packages/contracts packages/contracts
RUN pnpm --filter @finance/mcp build
ENV NODE_ENV=production MCP_PORT=3001
EXPOSE 3001
CMD ["node", "apps/mcp/dist/index.js"]
