# Sovryn Indexer

## Requirements

- [Docker](https://www.docker.com/)
- [Node v20+](https://nodejs.org/) (optional, included in docker image)
- [Yarn](https://yarnpkg.com/) (optional, included in docker image)

## Development

```bash
cp .env.example .env
pnpm install
pnpm docker:dev
```

## Migrations

`yarn studio` - serves web interface for drizzle studio on https://local.drizzle.studio

`yarn migrate:generate` - creates migration file from changes found in schema files.

`yarn migrate` - runs migrations

`yarn db:push` - pushes schema changes to the database

`yarn db:seed` - seeds the database with initial data (/src/database/seed.ts file)

`yarn db:reset` - deletes all data and tables from the database

## Docker

Build image

`docker build -t sovryn/indexer .`

Run image

`docker run -p 8000:8000 -it sovryn/indexer`

