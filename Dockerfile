FROM node:22.7.0 as base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

COPY . ./

# Install deps and build
RUN pnpm install && pnpm typechain && pnpm build && cp -r /src/artifacts/* /build/artifacts

ENV NODE_ENV production
ENV NODE_PATH ./build

EXPOSE 8000

ENTRYPOINT [ "node", "build/index.js"]
