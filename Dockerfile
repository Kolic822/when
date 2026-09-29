# Build the Angular app, then run the Node server that serves it and the live sync.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
# Whens are kept in one file; mount a volume at /data so they survive redeploys.
ENV DATA_FILE=/data/events.json
EXPOSE 3000
CMD ["node", "server/index.mjs"]
