FROM node:20-alpine
RUN apk add --no-cache python3 make g++ sqlite-dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --build-from-source
COPY . .
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
