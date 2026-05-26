<div align="center">

  <h1>🎟️ EventLife</h1>
  <p><strong>Plataforma Integral de Gestión de Eventos y Venta de Entradas</strong></p>

  [![Angular](https://img.shields.io/badge/Angular-17-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
  [![Node.js](https://img.shields.io/badge/Node.js-18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Redis](https://img.shields.io/badge/Redis-Cache-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

  <p>
    <a href="https://event-life.netlify.app">🚀 Ver Demo</a> •
    <a href="https://github.com/cufardixx/TP_DSW_2024_3K1">📂 Repositorio</a> •
    <a href="#instalación">⚙️ Instalación</a>
  </p>

</div>

---

## 📖 Descripción

**EventLife** es una solución Full-Stack moderna para la organización y asistencia a eventos. Permite a los usuarios descubrir experiencias únicas, adquirir entradas de forma segura con **MercadoPago** y acceder mediante **códigos QR**. Para los organizadores, ofrece un panel de control robusto con estadísticas en tiempo real y gestión de audiencia.

El proyecto destaca por su arquitectura escalable, seguridad robusta y una experiencia de usuario fluida y responsiva.

## ✨ Características Principales

### 👤 Usuarios y Seguridad
*   **Autenticación Híbrida:** Registro tradicional y Login social con **Google OAuth**.
*   **Seguridad:** Protección JWT, encriptación Bcrypt y validación de esquemas con Zod.
*   **Roles:** Sistema RBAC (Cliente, Organizador, Administrador).

### 🎟️ Eventos y Entradas
*   **Exploración:** Búsqueda avanzada con filtros por categoría y ubicación.
*   **Compra Segura:** Integración con **MercadoPago** (Webhooks e Idempotencia).
*   **Entradas Digitales:** Generación automática de Tickets PDF y códigos QR únicos.

### 📊 Gestión y Dashboard
*   **Estadísticas:** Gráficos interactivos con **ApexCharts**.
*   **Escáner QR:** Validación de accesos en tiempo real para control de puerta.
*   **Mapas:** Geolocalización de eventos con **Leaflet**.

## 🛠️ Stack Tecnológico

### Frontend (Client-Side)
*   **Framework:** Angular 17 (Standalone Components)
*   **Estilos:** Tailwind CSS (Diseño Responsivo)
*   **Librerías:** Leaflet (Mapas), ApexCharts (Gráficos), ZXing (Escáner QR), HTML2Canvas (PDF).

### Backend (Server-Side)
*   **Runtime:** Node.js & Express
*   **Base de Datos:** PostgreSQL (NeonDB) con TypeORM.
*   **Caché:** Redis (Optimización de consultas frecuentes).
*   **Validación:** Zod.
*   **Documentación:** Swagger UI.

### Infraestructura
*   **Frontend:** Netlify
*   **Backend:** Render
*   **DB:** Neon (PostgreSQL)

## 🌿 Flujo de Trabajo con Git

Este proyecto utiliza un flujo simplificado de Git optimizado para desarrollo individual:

### Ramas principales
- **`main`**: Código estable en producción. Solo recibe merge desde `dev`.
- **`dev`**: Rama de desarrollo activo. Integra todas las features antes de pasar a producción.
- **`feature/*`**: Ramas temporales para cada tarea o cambio.

### Workflow diario
```bash
# 1. Actualizar dev
git checkout dev
git pull origin dev

# 2. Crear feature
git checkout -b feature/nombre-de-la-tarea

# 3. Commits semánticos
git commit -m "feat(scope): descripción"
# tipos: feat, fix, refactor, docs, test, chore, security

# 4. Subir y crear PR en GitHub
git push -u origin feature/nombre-de-la-tarea

# 5. Mergear a dev vía Pull Request (Squash and merge)
# 6. Cuando dev está estable, mergear a main
git checkout main
git merge dev
git tag -a vX.X.X -m "Release description"
git push origin main --tags
```

## 📸 Capturas y Demos


 ![Landig](https://github.com/user-attachments/assets/578b0b73-47db-4505-93f1-2aee1c46df43) ![Explorar](https://github.com/user-attachments/assets/00011087-feef-4d34-8c77-c5bdd55897a0)
![Login](https://github.com/user-attachments/assets/9c38c6da-914b-4a40-b32d-63bfd30a44d0) ![Crear](https://github.com/user-attachments/assets/ac93bc79-5454-4731-824c-4214e77b5355) 
![Perfil](https://github.com/user-attachments/assets/7d6ba359-3dcf-46f1-a9fb-9b434a1d6abe) ![Tickets](https://github.com/user-attachments/assets/51e4350b-7c5c-4f41-b32a-a2920562b8eb) 
![Estadisticas](https://github.com/user-attachments/assets/00c592d4-f063-4138-a914-e9cfc86afbf9) 

## ⚙️ Instalación y Ejecución

### Prerrequisitos
*   Node.js (v18+)
*   PostgreSQL
*   Redis (Opcional para desarrollo, recomendado para prod)

### 1. Clonar el repositorio
```bash
git clone https://github.com/cufardixx/TP_DSW_2024_3K1.git
cd TP_DSW_2024_3K1
```

### 2. Configurar Backend
```bash
cd Backend
npm install
```

Crea un archivo `.env` en `Backend/` basado en `.env.example`:
```env
CLIENT_URL=
CLIENT_URLS=

DATABASE_URL=

PGHOST=
PGPORT=
PGUSER=
PGPASSWORD=
PGDATABASE=



MAIL_FROM=
MAIL_HOST=
MAIL_PASSWORD=
MAIL_PORT=
MAIL_USER=

BREVO_API_KEY=


MP_ACCESS_TOKEN=
MP_NOTIFICATION_URL=
MP_WEBHOOK_SECRET=

SECRET_KEY=

ID_CLIENT_GOOGLE_OAUTH=
```

Ejecutar en desarrollo:
```bash
npm run dev
```

### 3. Configurar Frontend
```bash
cd ../Frontend
npm install
npm start
```
Accede a `http://localhost:4200`.




<div align="center">
  <p>Desarrollado para la cátedra de Desarrollo de Software - 2024</p>
  <p>Universidad Tecnológica Nacional</p>
  <p>Actualizado al año 2026</p>
</div>
