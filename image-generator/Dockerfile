FROM node:20-alpine

# canvas (node-canvas) requires Cairo + Pango native libs
RUN apk add --no-cache \
  cairo-dev \
  pango-dev \
  libjpeg-turbo-dev \
  giflib-dev \
  librsvg-dev \
  python3 \
  make \
  g++ \
  pkgconfig

WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
