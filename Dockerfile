# Build the webpack bundles, then serve the site as static files with nginx.
FROM node:22-slim AS build

WORKDIR /app

# Install dependencies first so this layer is cached between source-only rebuilds.
COPY dummy_IDE/package.json dummy_IDE/package-lock.json ./dummy_IDE/
RUN npm ci --prefix dummy_IDE

# webpack also bundles debugger/, debuggee/ and generator/ from outside dummy_IDE.
COPY . .
RUN npm run build --prefix dummy_IDE && rm -rf dummy_IDE/node_modules

FROM nginx:alpine

# nginx's MIME table has no .mjs entry, and browsers refuse ES modules (Pyodide, php-wasm)
# that aren't served as JavaScript.
RUN echo 'types { application/javascript mjs; }' > /etc/nginx/conf.d/mjs-mime.conf

COPY --from=build /app/dummy_IDE /usr/share/nginx/html

EXPOSE 80
