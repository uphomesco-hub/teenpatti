FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8787
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/game ./src/game

EXPOSE 8787
CMD ["npm", "start"]
