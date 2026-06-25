FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_BOM_API_URL=https://bom-tool-api.jollyfield-91f54af9.centralindia.azurecontainerapps.io
ARG VITE_ADMIN_EMAILS=admin@strenth.ai,suraj@strenth.ai
ARG VITE_ALLOWED_EMAIL_DOMAINS=strenth.ai
ARG VITE_GOOGLE_CLIENT_ID=518777134913-rercl2bikkq6gdp84cg43f9t3425uk02.apps.googleusercontent.com

ENV VITE_BOM_API_URL=$VITE_BOM_API_URL
ENV VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS
ENV VITE_ALLOWED_EMAIL_DOMAINS=$VITE_ALLOWED_EMAIL_DOMAINS
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["/bin/sh", "-c", "printf 'window.__STRENTH_CONFIG__ = { googleClientId: \"%s\" };\\n' \"${VITE_GOOGLE_CLIENT_ID:-$AUTH_GOOGLE_ID}\" > /usr/share/nginx/html/runtime-config.js && nginx -g 'daemon off;'"]
