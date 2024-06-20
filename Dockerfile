FROM node:20.10.0 as base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@8.15.6 --activate

COPY . ./

# Install deps
RUN pnpm install

# Build dist
RUN pnpm typechain
RUN pnpm build

# Start production image build
FROM node:20.10.0

# Copy node modules and build directory
COPY --from=base ./package.json ./
COPY --from=base ./node_modules ./node_modules
COPY --from=base ./config ./config
COPY --from=base ./build ./build
COPY --from=base ./src/artifacts ./build/artifacts
COPY --from=base ./migrations ./migrations
COPY --from=base ./scripts ./scripts

ENV NODE_ENV production
ENV NODE_PATH ./build

EXPOSE 8000

ENTRYPOINT [ "node", "build/index.js"]
