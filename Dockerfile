# =======================================================
# Stage 1: Build the React / Vite Frontend
# =======================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source and compile production bundle
COPY frontend/ ./
RUN npm run build

# =======================================================
# Stage 2: Production Server (Node.js Express + Static UI)
# =======================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Set runtime environment
ENV NODE_ENV=production
ENV PORT=8080

# Install backend production dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy backend source code
COPY backend/ ./

# Copy compiled frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose web service port
EXPOSE 8080

# Health check to ensure service readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/history || exit 1

# Start the unified backend server
CMD ["node", "server.js"]
