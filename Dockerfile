FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_MEND_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_MEND_API_URL=$VITE_MEND_API_URL
RUN test -n "$VITE_SUPABASE_URL" \
  && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime

RUN apk add --no-cache git openssh-client ffmpeg bash
ENV NODE_ENV=production
ENV PORT=8787
WORKDIR /app
RUN mkdir -p /workspace/runs \
  && chown -R node:node /workspace

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8787/api/ready >/dev/null || exit 1

FROM runtime AS production
CMD ["node", "dist-server/server/index.js"]

FROM runtime AS runner

USER root
RUN npm install --global --omit=dev \
    @openai/codex@0.147.0 \
    @anthropic-ai/claude-code@2.1.224 \
    @google/gemini-cli@0.54.4 \
    @verboo/code@0.15.3 \
  && npm cache clean --force
USER node
CMD ["node", "dist-server/server/index.js"]
