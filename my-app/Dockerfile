FROM public.ecr.aws/docker/library/node:18-alpine AS base

RUN mkdir /app && chown node:node /app
WORKDIR /app

USER node

# Dependencies stage
FROM base AS dependencies

COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules /tmp/prod_node_modules && \
    npm ci

# Build stage
FROM dependencies AS build

COPY --chown=node:node . .
RUN npm run build

# Production stage
FROM base AS production

ENV NODE_ENV=production

COPY --chown=node:node package.json package-lock.json* ./
COPY --chown=node:node --from=dependencies /tmp/prod_node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist

EXPOSE 8081
CMD [ "npm", "run", "preview" ]

# Development stage
FROM base AS development

ENV NODE_ENV=development

COPY --chown=node:node package.json package-lock.json* ./
RUN npm install

COPY --chown=node:node . .

EXPOSE 8081
CMD [ "npm", "run", "dev" ]