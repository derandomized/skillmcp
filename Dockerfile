FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/dist ./server/dist
COPY server/ui ./server/ui
COPY catalog ./catalog
ENV PORT=8080 HOST=0.0.0.0 SKILLMCP_INBOX=/data/inbox
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
