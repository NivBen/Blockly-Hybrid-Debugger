FROM node:22-slim

WORKDIR /app

# Install dependencies first so this layer is cached between source-only rebuilds.
# Scripts are skipped at the root because its postinstall only installs dummy_IDE,
# which is done explicitly (and from its lockfile) right after.
COPY package.json package-lock.json ./
COPY dummy_IDE/package.json dummy_IDE/package-lock.json ./dummy_IDE/
RUN npm ci --ignore-scripts && npm ci --prefix dummy_IDE

COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
