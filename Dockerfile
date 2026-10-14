FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY . .
ARG TRACK_IT_BUILD_ID
RUN TRACK_IT_BUILD_ID="$TRACK_IT_BUILD_ID" pnpm build

FROM base AS api
ENV NODE_ENV=production
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node tsconfig.json ./
USER node
EXPOSE 3001
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
RUN --mount=type=bind,source=.,target=/context,readonly \
    if [ -d /context/.release-assets ]; then mkdir -p /srv/assets && cp -rn /context/.release-assets/. /srv/assets/; fi

