# Flujo de trabajo con Git — ParkEasy

Guía de colaboración para cinco integrantes.

> **Estado actual:** el repositorio tiene Git inicializado pero **sin remoto**.
> Nadie ha creado todavía el repositorio en GitHub. Ver §7.

## 1. Ramas

| Rama | Quién trabaja ahí | Contenido |
| --- | --- | --- |
| `main` | — |siempre desplegable / estable |
| `feature/persona-1-auth` | Persona 1 | Supabase, RLS, servicios, docs base |
| `feature/persona-2-ui` | Persona 2 | Diseño, welcome/login/registro, perfil |
| `feature/persona-3-parking` | Persona 3 | Listado, filtros, administración de espacios |
| `feature/persona-4-gps` | Persona 4 | Permisos GPS, mapa, guardar/encontrar auto |
| `feature/persona-5-history` | Persona 5 | Historial, CRUD, recordatorios |

### Reglas

1. **`main` no se toca directamente.** Nadie commitea ahí salvo releases.
2. **Una rama por persona y por módulo.** Evita conflictos Massive.
3. **Ramas cortas.** Si una rama vive más de una semana, algo se partió.
4. **Nombre de rama = `feature/persona-N-<algo>`.**

```bash
git switch main
git pull origin main
git switch -c feature/persona-3-filtros
```

## 2. Commits

Formato: `<tipo>(<ámbito>): <descripción en imperativo>`

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`.

```bash
# Bien
git commit -m "feat(spaces): add status filter to listSpaces"
git commit -m "fix(errors): map one_active_session_per_user to a friendly message"
git commit -m "docs(database): document composite FK on parking_sessions"

# Mal
git commit -m "cambios"
git commit -m "arreglado el bug del perfil"
```

El cuerpo del commit explica **por qué**, no qué. El "qué" ya lo dice el diff.

## 3. Pull Requests

1. `git push -u origin feature/persona-N-<algo>`
2. Abrir PR hacia `main`.
3. **Al menos una revisión de otra persona** antes de mergear.
4. Los checks deben pasar:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
5. Merge con **squash** (`Squash and merge`): un PR = un commit en `main`,
   con mensajes de commit limpios.

### Qué revisar en el PR

- ¿Se respeta la propiedad de ficheros? (`docs/INTEGRATION_GUIDE.md` §7)
- ¿Se ha editado `001_initial_schema.sql`? Si sí, **bloquea el PR**.
- ¿`npm run typecheck` y `npm test` pasan?
- ¿Hay `any` nuevos? Cada uno necesita justificación.
- ¿Hay secretos, `.env` o datos reales?

## 4. Ficheros propietarios

| Ruta | Dueño |
| --- | --- |
| `src/lib/`, `src/contexts/`, `src/hooks/` | Persona 1 |
| `src/services/` | Persona 1 (los demás **consumen**, no editan) |
| `src/types/database.types.ts` | Persona 1 |
| `src/constants/routes.ts` | Persona 1 |
| `supabase/migrations/` | Persona 1 |
| `docs/` | Persona 1 (cada quien puede añadir a su sección) |
| `src/app/(auth)/*` | Persona 2 |
| `src/app/(app)/profile/*` | Persona 2 |
| `src/components/common/*` | Persona 2 |
| `src/app/(app)/parking/*` | Persona 3 |
| `src/app/(app)/vehicle/*` | Persona 4 |
| `src/app/(app)/history/*` | Persona 5 |
| `src/app/_layout.tsx` | Persona 1 (coordina) |

**Antes de tocar un fichero de otro: abre PR y coméntalo.** Nadie va a
rechazar un PR por tocar un fichero compartido; sí va a exigirte que avises si
cambia sin previo aviso.

## 5. Migraciones

Regla dura:

> **`001_initial_schema.sql` no se edita una vez aplicado.**

Un cambio de esquema va en `supabase/migrations/00N_<descripcion>.sql`:

```bash
# 002_add_avatar_bucket.sql
# 003_add_sessions_index.sql
```

Criterio: un `002` debe aplicarse sobre un `001` ya en producción **sin tocar
el `001`**. Si necesitas modificar el `001`, es porque aún no se aplicó en
ningún sitio.

Cada migración debe:
1. Ser idempotente cuando se pueda (`if not exists`, `on conflict`).
2. Incluir al inicio un comentario con qué hace y por qué.
3. Ir acompañada de la actualización de `docs/DATABASE.md`.
4. Regenerar `src/types/database.types.ts` si cambia una tabla.

Y siempre **coordinado**: avisa en el grupo antes de aplicar SQL real. Alguien
puede estar a mitad de una prueba manual.

## 6. Conflictos

Orden recomendado para minimizar conflictos:

1. **Servicios y tipos**: son la capa estable. Casi nunca cambian de forma incompatible.
2. **Contextos/hooks**: cambian poco.
3. **SQL**: conflictos casi siempre son de que alguien editó `001`.
4. **Pantallas**: `src/app/(app)/index.tsx` y `src/app/_layout.tsx` son los
   puntos calientes: todo el mundo edita `index.tsx`.

Cuando un conflicto sea inevitable:

```bash
git status                     # ver los ficheros en conflicto
# resolver el conflicto a mano, luego:
git add <fichero>
git rebase --continue
```

Regla de desempate:

- **En `package.json`**, manda la versión compatible con el SDK (usa
  `npx expo install --fix`).
- **En `src/types/database.types.ts`**, manda el SQL de `supabase/migrations`.
- **En `src/app/_layout.tsx`**, manda Persona 1.
- **Si el conflicto es demasiado gordo**: `git rebase --abort` y divide el PR en
  dos. Es mejor que perder una tarde.

## 7. Configurar GitHub (pendiente)

**No hay remoto todavía.** Nadie ha proporcionado un repositorio ni
credenciales, así que **no se ha creado ni subido nada**.

Cuando el equipo decida hacerlo:

### 7.1 Crear el repositorio (una sola persona)

1. https://github.com/new
2. Nombre: `parkeasy`
3. **Private** (no suban claves ni datos reales a un repo público).
4. **Sin** README, .gitignore ni licencia: el repo local ya tiene su historia.

### 7.2 Enlazar el repo local

```bash
git remote add origin https://github.com/ORGUE/PERSONA/parkeasy.git
git remote -v                    # comprobar
git push -u origin main
```

Si ya existiera un remoto, **no lo sobrescribas**: pregunta antes.

### 7.3 Configurar identidad (si falta)

```bash
git config user.name  "Nombre Apellido"
git config user.email "tu@correo.com"
```

### 7.4 Proteger `main`

Settings → Branches → Add rule:

- Branch name pattern: `main`
- Require a pull request before merging
- Require approvals: 1
- Require status checks to pass: `lint`, `typecheck`, `test`

## 8. Checklist antes de cada PR

```bash
git switch main && git pull origin main
git switch -c feature/persona-N-<tu-tarea>
# ... trabajar ...
npm run lint
npm run typecheck
npm test
git add -A
git commit -m "feat(ámbito): descripción en imperativo"
git push -u origin <rama>
```

- [ ] `npm run lint` sin errores
- [ ] `npm run typecheck` sin errores
- [ ] `npm test` en verde
- [ ] No he editado ficheros de otra persona sin avisar
- [ ] No he editado `001_initial_schema.sql`
- [ ] No subo `.env`, claves ni datos reales
- [ ] El mensaje de commit explica el **porqué**

## 9. Datos que nunca deben subirse

- `.env` (ya está en `.gitignore`; **verifica** antes de commitear)
- `service_role`, `secret`, contraseñas de la BD
- JWT o tokens de sesión
- `.expo/`, `node_modules/`, builds nativos

Si un secreto se sube por error, **no basta con borrarlo en el siguiente
commit**: hay que rotarlo. En GitHub, "eliminar" un archivo sólo lo saca de la
versión actual.