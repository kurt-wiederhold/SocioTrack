# SocioTrack · Contexto del proyecto

Sistema web de gestión de socios y consolidación de donaciones para la **Fundación Africa Dream**.
Proyecto universitario (USM). Contraparte en la Fundación: Rodrigo Mercado.

## Para qué sirve

La Fundación recibe donaciones recurrentes por varios medios y hoy las cruza a mano. La aplicación
**lee** los archivos que cada medio entrega, los ordena por mes y muestra quién pagó, quién no y por qué medio,
para evitar el error humano.

Medios que lee:

| Origen | Archivo | Qué trae |
|---|---|---|
| PAC (Banco de Chile) | Rendición `.xlsx` | Cargos con código `300` = cobrado, `800` = rechazado, y totales al final |
| PAC | Nómina `.txt` (80 caracteres por línea) | Lo que se envió a cobrar (RUT, banco, monto) |
| PAT (Transbank) | Respuesta (`.csv` o sin extensión) | `monto;nombre;rut;APROBADA/RECHAZO` |
| PAT | Nómina `.csv` | `V;monto;nombre;rut` |
| Donar Online | `.xlsx` | Nombre, apellido, monto, estado (Cobrada/Rechazada). RUT y correo si la exportación los trae |
| Causaxcausa | `.csv` | Donante, correo, RUT (a veces), monto, estado (Confirmada / Socio activo) |
| Transferencias | Planilla Excel | Nombre, apellido y monto |

Vocabulario de la Fundación:

- **Subida:** lo que la Fundación envía a cobrar (nóminas PAC y PAT). Se sube **tres veces al mes**:
  1 envío + 2 reintentos con los no cobrados.
- **Bajada:** lo que se exporta desde el banco y las plataformas (rendición, respuesta de Transbank, planillas).

## Pestañas

- **Socios:** alta manual, edición, importación y exportación Excel, filtros, plantilla.
- **Cobros:** ciclo mensual de cobro y nóminas depuradas solo con los no cobrados.
- **Consolidación:** carga de archivos, vista mensual por origen, conclusiones y exportación a Excel.
- **Informes:** gráficos y comparativos por mes.
- **Proveedores** y **Categorías:** catálogos. El pago al proveedor es independiente del socio, y hay una alerta
  cuando termina ese pago y el socio pasa 100% a la Fundación.

## Decisiones de la consolidación

- El donante se identifica por **RUT**, si no hay por **correo** y, en último caso, por **nombre** normalizado.
- En Causaxcausa, "Socio activo" **es un cobro**. Cuando el mismo donante aparece como "Confirmada" y como
  "Socio activo" por el mismo monto, se queda solo "Socio activo" para no contar doble (indicación de la Fundación).
  Cada estado se puede cambiar en pantalla al cargar el archivo.
- "Aporte a la gestión" no se suma al monto de la donación.
- Un mismo archivo no se puede cargar dos veces (se detecta por su contenido), salvo que se pida reemplazarlo.
- Antes de guardar, la carga muestra una simulación. Si la rendición PAC no cuadra con sus totales, no se guarda.

## Tecnología

- **Frontend:** React 19, Vite 6, Tailwind 4, SheetJS para Excel. Carpeta `frontend/`.
- **Backend:** PHP 8.1+ sin dependencias (PDO, router propio, sesión con CSRF y límite de intentos de login). Carpeta `backend/`.
- **Base de datos:** MySQL/MariaDB (producción en Dreamhost y local). SQLite solo para pruebas.

```
backend/
  config/config.example.php   copiar como config.php (no se sube a GitHub)
  database/schema.mysql.sql   esquema completo
  database/migraciones/       cambios para una base ya creada (002, 003, 004)
  public/index.php            rutas de la API
  src/                        lógica (Socios, Cobros, Consolidacion, Formatos, Informes…)
  scripts/                    crear_usuario.php, seed_dev.php (datos de demo)
  tests/                      unit.php y api.sh
frontend/
  src/features/               una carpeta por pestaña
  src/lib/respuestas.js       lector de los archivos del banco y plataformas
  tests/                      pruebas del lector y verificador del protocolo de botones
```

## Cómo correrlo en este PC

Requisitos: WSL (Ubuntu) con PHP y MariaDB, Node.js y `npm install` hecho en `frontend/`.

1. Si la base no está corriendo: `wsl -d Ubuntu -- sudo service mariadb start`
2. Doble clic en `iniciar.bat`: levanta la API (puerto 8000) y la página (puerto 5173) y abre Edge en
   http://localhost:5173
3. Usuario demo: `demo@africadream.test`. La contraseña está en `backend/scripts/seed_dev.php` (`DEMO_PASSWORD`).

Pruebas:

```bash
cd frontend && npm test && npm run lint
cd backend && php tests/unit.php && bash tests/api.sh
```

## Publicar en Dreamhost

1. Copiar `backend/config/config.example.php` a `config.php` con los datos de la base.
2. Base nueva: ejecutar `database/schema.mysql.sql`. Base existente: ejecutar **una vez** cada migración
   pendiente, en orden (la última es `004_donaciones_email.sql`).
3. `npm run build` en `frontend/` y subir `dist/`; la API se sirve desde `backend/public/`.
4. Crear usuarios con `php scripts/crear_usuario.php`.

## Cuidado con los datos

El repositorio es **público**. Los archivos reales de la Fundación tienen RUT, nombres y correos de personas:
**nunca se suben ni se copian al repo**. Las pruebas usan solo datos ficticios. Tampoco se sube `config.php`.

## Respuestas de Rodrigo (nov. 2026)

1. Las nóminas se suben **3 veces al mes**, no 4 (`cobro.max_reintentos = 2`).
2. "Socio activo": si la plataforma usa dos nombres para el mismo pago, quedarse con "Socio activo".
3. Donar Online se puede exportar con RUT y correo: los enviará así.
4. Enviará archivos de un mismo mes para probar el cruce. De Causaxcausa solo hay archivo del mes actual.
