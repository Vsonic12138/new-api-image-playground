FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:standalone

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3005
WORKDIR /app
COPY --from=build /workspace/server ./server
COPY --from=build /workspace/dist ./dist
USER node
EXPOSE 3005
CMD ["node", "server/standalone.mjs"]
