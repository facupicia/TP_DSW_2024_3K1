# ==============================================================================
# Etapa 1: Compilación
# ==============================================================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias primero (mejor caché de capas)
COPY package.json package-lock.json ./

# Instalar TODAS las dependencias (incluidas devDependencies para compilar TS)
RUN npm ci

# Copiar código fuente
COPY tsconfig.json ./
COPY src/ ./src/

# Compilar TypeScript
RUN npm run build

# Copiar archivos .sql que se leen en runtime (migraciones y scripts)
RUN cp -r src/database/migrations/*.sql dist/database/migrations/ 2>/dev/null || true
RUN cp -r src/database/*.sql dist/database/ 2>/dev/null || true

# ==============================================================================
# Etapa 2: Producción
# ==============================================================================
FROM node:18-alpine AS production

# Crear usuario no-root para seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el build compilado desde la etapa anterior
COPY --from=builder /app/dist ./dist

# Cambiar al usuario no-root
USER appuser

# Puerto por defecto de la aplicación
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicio
CMD ["node", "dist/index.js"]
