FROM node:20-alpine

# Native deps for node-canvas
RUN apk add --no-cache \
  cairo-dev \
  pango-dev \
  libjpeg-turbo-dev \
  giflib-dev \
  librsvg-dev \
  python3 \
  make \
  g++ \
  pkgconfig \
  curl \
  unzip \
  fontconfig

# Download Inter font (Black + Bold + Regular) for crisp display text
RUN mkdir -p /app/fonts && \
  curl -sL "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" -o /tmp/inter.zip && \
  unzip -j /tmp/inter.zip "*Inter-Black.otf"   -d /app/fonts/ && \
  unzip -j /tmp/inter.zip "*Inter-Bold.otf"    -d /app/fonts/ && \
  unzip -j /tmp/inter.zip "*Inter-Regular.otf" -d /app/fonts/ && \
  mkdir -p /usr/share/fonts/ && cp /app/fonts/*.otf /usr/share/fonts/ && \
  fc-cache -fv && \
  rm /tmp/inter.zip

WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .

# fonts dir already exists from above
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
