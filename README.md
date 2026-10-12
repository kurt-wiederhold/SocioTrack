# Automatización Africa Dream — Módulo de Socios

CRUD de socios recurrentes de la Fundación Africa Dream, con **ingreso manual** e **importación desde Excel/CSV**.
Es la base de datos sobre la que se construyen los demás módulos del proyecto (exportación de nóminas PAC/PAT,
match de cobros, reintentos e informes).

- **Frontend:** React 19 + Tailwind CSS 4 (Vite). Lectura de Excel en el navegador con SheetJS.
- **Backend:** PHP 8.1+ sin dependencias externas (PDO). MySQL en producción, SQLite para desarrollo.
- **Hosting:** Dreamhost (Apache + PHP + MySQL).

## Qué cubre

| Requerimiento (documento de la Fundación) | Implementación |
|---|---|
| Importar socios desde Excel | Asistente de 4 pasos: archivo → columnas → revisión → listo. Detecta columnas por nombre (RUT, Nombre, Monto, Medio de pago…) aunque haya títulos arriba, o por contenido si la planilla no tiene encabezados (ej. archivo de Transbank `V;7000;Nombre;RUT`). Simula antes de guardar y muestra fila por fila qué se crea, actualiza, omite o tiene errores. |
| Ingresar socios manualmente | Formulario con validación de RUT (módulo 11), correo, teléfono y montos. |
| Editar / eliminar | Edición completa; al eliminar se sugiere usar estado **Baja** para no perder historial en los informes. |
| Independizar la base del proveedor (punto c) | Por socio: proveedor, pago mensual, meses y fecha de inicio. Se calcula el último mes de pago y el progreso (`8/12`). **Alerta** cuando un socio paga su última cuota este mes y etiqueta **100% Fundación** cuando terminó. |
| Base para nóminas PAC / PAT | Cada socio tiene medio de pago `PAC` (cargo en cuenta, Banco de Chile) o `PAT` (tarjeta vía Transbank), banco, monto, estado y fechas de alta/baja (necesarias para los informes de altas y bajas). |

| Sectorizar por rangos (punto b) | Filtro por rango de monto; los rangos se ajustan en `frontend/src/features/socios/constants.js` (`RANGOS_MONTO`). |

También: búsqueda (nombre, RUT con o sin puntos, correo, proveedor), filtros por estado / medio / proveedor,
orden por columna, paginación, exportar a Excel, plantilla de importación descargable y vista en tarjetas para celular.

### Importación: cómo se interpretan los datos

- **Excel (.xlsx/.xls):** se respetan los tipos de Excel (números y fechas reales).
- **CSV/TXT:** se lee como texto (UTF-8 o Windows-1252, se detecta solo) y el backend interpreta en formato chileno:
  `$5.000` → 5000, `03/01/2020` → 3 de enero. Así se evita que `$5.000` se lea como 5 o que las fechas se lean como mes/día.
- La revisión muestra monto, medio y fecha **ya interpretados** antes de confirmar.
- Con "Actualizar socios que ya existen", solo cambian las columnas con datos; filas idénticas se omiten ("sin cambios").

## Estructura

```
backend/
  public/            index.php (único punto de entrada de la API) + .htaccess
  src/               Auth, Router, Db, Rut, SocioValidator, SocioRepository, Controllers/
  config/            config.example.php  →  copiar a config.php (no se sube a git)
  database/          schema.mysql.sql (producción) y schema.sqlite.sql (desarrollo)
  scripts/           crear_usuario.php, init_sqlite.php, seed_dev.php
  tests/             unit.php (RUT y validaciones) y api.sh (prueba de punta a punta)
frontend/
  src/lib/           api.js, excel.js, rut.js, format.js
  src/components/    ui.jsx (botones, inputs, modal, badges), Toast.jsx
  src/features/socios/  SociosPage, SocioForm, ImportarSocios
```

## Desarrollo local

Requisitos: Node 20+ y PHP 8.1+ con `pdo_sqlite` (en Windows sirve WSL: `sudo apt install php-cli php-sqlite3 php-mbstring`).

```bash
# 1) Backend con SQLite y datos ficticios
cd backend
cp config/config.example.php config/config.php   # descomentar la línea 'dsn' => 'sqlite:...' y poner debug => true
php scripts/seed_dev.php                          # crea la base, 60 socios de ejemplo y el usuario demo
php -S localhost:8000 -t public public/index.php

# 2) Frontend (otra terminal)
cd frontend
npm install
npm run dev                                       # http://localhost:5173  (/api se redirige al puerto 8000)
```

El usuario demo y su contraseña están en `backend/scripts/seed_dev.php` (solo para desarrollo).

Pruebas del backend:

```bash
cd backend
php tests/unit.php      # validación de RUT, montos, fechas, proveedor
bash tests/api.sh       # login, CSRF, CRUD, importación, filtros (usa una base temporal)
```

## Despliegue en Dreamhost

1. **Base de datos:** crear una base MySQL en el panel y ejecutar `backend/database/schema.mysql.sql` (phpMyAdmin).
2. **Backend fuera del sitio web:** subir `backend/src`, `backend/config` y `backend/scripts` a `~/africadream_backend/`.
   Copiar `config.example.php` a `config.php` con los datos de MySQL (`debug => false`).
3. **API:** subir el contenido de `backend/public/` a `~/tudominio.cl/api/`. `index.php` encuentra solo `~/africadream_backend`.
4. **Frontend:** `cd frontend && npm run build` y subir el contenido de `frontend/dist/` a `~/tudominio.cl/`.
5. **Usuarios:** por SSH, `php ~/africadream_backend/scripts/crear_usuario.php correo@africadream.cl "Nombre"` (pide la contraseña, mínimo 10 caracteres).
6. Activar HTTPS (Let's Encrypt) en el panel. El `.htaccess` del sitio redirige todo a HTTPS.

## API

Todas las rutas (salvo `/auth/*`) requieren sesión. Las que modifican datos requieren la cabecera `X-CSRF-Token`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/auth/me` | Usuario actual y token CSRF |
| POST | `/api/auth/login` · `/api/auth/logout` | Iniciar / cerrar sesión |
| GET | `/api/socios?buscar=&estado=&medio_pago=&proveedor_estado=&monto_min=&monto_max=&orden=&dir=&pagina=&por_pagina=` | Listado paginado + `resumen` (totales y alertas) |
| GET | `/api/socios/{id}` | Detalle |
| POST | `/api/socios` | Crear |
| PUT | `/api/socios/{id}` | Editar |
| DELETE | `/api/socios/{id}` | Eliminar |
| GET | `/api/socios/proveedores` | Proveedores ya usados (autocompletar) |
| POST | `/api/socios/importar` | `{ filas: [...], simular: true\|false, actualizar_existentes: bool }` |

Errores de validación: `422 { error, errores: { campo: mensaje } }`.

## Seguridad

- Contraseñas con `password_hash` (bcrypt); bloqueo tras 5 intentos fallidos por cuenta (20 por IP) durante 15 minutos; mismo mensaje y mismo tiempo de respuesta exista o no el correo.
- Sesión con cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, regeneración de ID al iniciar sesión y expiración por inactividad (con `gc_maxlifetime` alineado para que PHP no la borre antes).
- Token CSRF obligatorio en toda petición que modifica datos.
- Consultas 100 % preparadas (PDO); columnas de orden en lista blanca; comodines de búsqueda escapados.
- El backend vuelve a validar todo lo que llega desde el navegador (el Excel se lee en el cliente, pero la API decide).
- Importación transaccional (o se guardan todas las filas válidas o ninguna), máximo 5.000 filas; caracteres de control eliminados.
- `npm audit`: 0 vulnerabilidades (SheetJS 0.20.3 desde su CDN oficial; la versión de npm 0.18 tiene CVE conocidos).
- Código y configuración fuera del directorio web; `.htaccess` con `Require all denied` como respaldo.
- Cabeceras de seguridad (CSP, `X-Frame-Options`, `nosniff`) y exportación a Excel protegida contra inyección de fórmulas.
- No se guardan datos de tarjetas ni cuentas: PAT/PAC se identifican por el RUT, como en los archivos de Transbank y Banco de Chile.

## Limitaciones conocidas

- Un socio que vuelve después de una baja se reactiva en el mismo registro (el RUT es único); su `fecha_alta` original se puede sobrescribir. Para informes históricos exactos convendrá una tabla de movimientos (alta/baja/cambio de monto) cuando se haga el módulo de informes.
- Todos los usuarios tienen los mismos permisos (no hay roles).

## Próximos módulos (según el documento)

- Exportar nómina PAC en formato Banco de Chile (registro de 80 bytes) y CSV para Transbank PAT, filtrando por rangos de monto.
- Importar rendición del banco / respuesta de Transbank, hacer el match cobrado / no cobrado y generar los 4 reintentos mensuales.
- Informes con gráficos de altas, bajas y montos (mensual, trimestral, semestral, anual y comparativos).
