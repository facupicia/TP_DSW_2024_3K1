# Guía de Migración: Sistema de Múltiples Roles

## Resumen

Se ha implementado un sistema de múltiples roles por usuario con jerarquía:

```
admin(5) > organizer(4) > scanner(3) > rrpp(2) > user(1)
```

## Cambios en la Base de Datos

### PostgreSQL

Ejecutar el script SQL de migración:

```bash
psql -d your_database -f Backend/src/database/migrations/migrate-roles.sql
```

### TypeORM

La entidad `User` ahora usa:

```typescript
@Column({
    type: "simple-array",
    default: "user"
})
roles: string[];
```

## Middleware de Autorización

### `checkRoleAuth(roles)` - Jerarquía

Permite acceso basado en jerarquía. Un admin puede acceder a rutas que requieren organizer.

```typescript
// Admin puede acceder (nivel 5 >= nivel 4)
checkRoleAuth(['organizer'])

// Organizer puede acceder (nivel 4 >= nivel 2)
checkRoleAuth(['rrpp'])
```

### `checkExactRole(roles)` - Coincidencia Exacta

Solo permite acceso si el usuario tiene el rol exacto.

```typescript
// Solo usuarios con rol 'rrpp' exacto
checkExactRole(['rrpp'])
```

## Frontend

### Helpers de Roles

```typescript
import { hasRoleLevel, hasExactRole, getHighestRole } from './interfaces/Usuario';

// Verificar jerarquía
hasRoleLevel(['admin', 'user'], 'organizer') // true

// Verificar rol exacto
hasExactRole(['admin', 'user'], 'rrpp') // false

// Obtener rol más alto
getHighestRole(['user', 'organizer']) // 'organizer'
```

### Guards

- `adminGuard` - Solo admin exacto
- `organizerGuard` - Organizer o superior (admin)
- `scannerGuard` - Scanner o admin
- `promoterGuard` - RRPP exacto

## Migración de Datos Existentes

### Opción 1: Script SQL (Recomendado para producción)

```bash
psql -d your_database -f Backend/src/database/migrations/migrate-roles.sql
```

### Opción 2: Script TypeScript

```bash
cd Backend
npx ts-node src/database/migrations/migrate-roles.ts
```

### Opción 3: Fallback Automático

El código ya incluye fallback para datos antiguos:

```typescript
const userRoles = user.roles || [user.rol] || ['user'];
```

## Tokens JWT

Los nuevos tokens incluyen `roles` en lugar de `rol`:

```json
{
  "id": 123,
  "roles": ["organizer", "user"],
  "iat": 1234567890
}
```

Los tokens antiguos siguen funcionando gracias al fallback.

## API de Actualización de Roles

### Backend

```typescript
PUT /api/user/:id/role
Body: {
  roles: ['organizer', 'user'],
  action: 'set' | 'add' | 'remove'
}
```

### Frontend

```typescript
authService.updateRole(userId, ['organizer', 'user'], 'set');
authService.updateRole(userId, ['scanner'], 'add');
authService.updateRole(userId, ['rrpp'], 'remove');
```

## Verificación

Después de la migración, verifica:

1. Los usuarios pueden iniciar sesión
2. Los roles se muestran correctamente en el panel de admin
3. Los guards funcionan correctamente
4. Los tokens nuevos incluyen el array `roles`

## Rollback

Si necesitas revertir:

```sql
-- Restaurar columna rol desde roles (tomando el primer rol)
UPDATE "user" SET rol = split_part(roles, ',', 1);
```
