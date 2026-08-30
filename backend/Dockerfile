FROM node:20-alpine

# Install curl for healthcheck probe
RUN apk add --no-cache curl python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
