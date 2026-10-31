FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js store.js seed-photo.js ./
COPY public ./public
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
