#!/usr/bin/env bash
# Prueba de punta a punta de la API contra una base desechable. No toca config/config.php.
# Uso (desde backend/):
#   bash tests/api.sh                         -> SQLite temporal
#   TEST_MYSQL_DB=africadream_test TEST_MYSQL_USER=u TEST_MYSQL_PASS=p bash tests/api.sh
#                                             -> MySQL/MariaDB (la base se BORRA y se recrea)
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
PORT=8099
BASE="http://127.0.0.1:$PORT/api"
JAR="$TMP/cookies"
fallos=0

export AD_CONFIG="$TMP/config.php"
if [ -n "${TEST_MYSQL_DB:-}" ]; then
  echo "Motor: MySQL/MariaDB ($TEST_MYSQL_DB)"
  cat > "$AD_CONFIG" <<EOF
<?php
return ['db' => ['dsn' => 'mysql:host=127.0.0.1;dbname=$TEST_MYSQL_DB;charset=utf8mb4', 'user' => '$TEST_MYSQL_USER', 'pass' => '$TEST_MYSQL_PASS'],
        'app' => ['debug' => true, 'session_minutes' => 120, 'max_import_rows' => 5000]];
EOF
  php -r '
    require "src/bootstrap.php";
    $pdo = App\Db::pdo();
    $pdo->exec("SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS socios, login_intentos, usuarios; SET FOREIGN_KEY_CHECKS=1;");
    $pdo->exec(file_get_contents("database/schema.mysql.sql"));'
else
  echo "Motor: SQLite"
  cat > "$AD_CONFIG" <<EOF
<?php
return ['db' => ['dsn' => 'sqlite:$TMP/test.sqlite', 'user' => null, 'pass' => null],
        'app' => ['debug' => true, 'session_minutes' => 120, 'max_import_rows' => 5000]];
EOF
  php scripts/init_sqlite.php >/dev/null
fi
restore() {
  kill "$SERVER" 2>/dev/null || true
  rm -rf "$TMP"
}
trap restore EXIT

AD_PASSWORD='clave-de-prueba-123' php scripts/crear_usuario.php admin@test.cl "Admin" >/dev/null
php -S 127.0.0.1:$PORT -t public public/index.php >/dev/null 2>&1 &
SERVER=$!
sleep 0.7

req() { # método ruta [json]
  local args=(-s -o "$TMP/body" -w '%{http_code}' -b "$JAR" -c "$JAR" -X "$1" -H 'Content-Type: application/json' -H "X-CSRF-Token: ${CSRF:-}")
  [ $# -ge 3 ] && args+=(--data "$3")
  curl "${args[@]}" "$BASE$2"
}
expect() { # nombre esperado obtenido
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FALLA $1: esperado $2, obtenido $3 -> $(head -c 300 "$TMP/body")"; fallos=$((fallos+1)); fi
}
json() { php -r '$d=json_decode(file_get_contents($argv[1]),true); foreach(explode(".",$argv[2]) as $k){$d=$d[$k]??null;} echo is_array($d)?json_encode($d):var_export($d,true);' "$TMP/body" "$1"; }

echo "Autenticación"
expect "listar sin sesión -> 401" 401 "$(req GET /socios)"
req GET /auth/me >/dev/null; CSRF=$(json csrf | tr -d "'")
SAVED=$CSRF; CSRF=malo
expect "login sin CSRF válido -> 419" 419 "$(req POST /auth/login '{"email":"admin@test.cl","password":"clave-de-prueba-123"}')"
CSRF=$SAVED
expect "login con clave mala -> 401" 401 "$(req POST /auth/login '{"email":"admin@test.cl","password":"x"}')"
expect "login usuario inexistente -> 401 (mismo mensaje)" "'Correo o contraseña incorrectos.'" "$(req POST /auth/login '{"email":"nadie@test.cl","password":"x"}' >/dev/null; json error)"
for i in 1 2 3 4 5; do req POST /auth/login '{"email":"bloqueo@test.cl","password":"x"}' >/dev/null; done
expect "bloqueo tras 5 intentos -> 429" 429 "$(req POST /auth/login '{"email":"bloqueo@test.cl","password":"x"}')"
expect "login correcto -> 200" 200 "$(req POST /auth/login '{"email":"admin@test.cl","password":"clave-de-prueba-123"}')"
CSRF=$(json csrf | tr -d "'")

echo "CRUD"
expect "crear socio inválido -> 422" 422 "$(req POST /socios '{"rut":"11111111-2","nombre":"","medio_pago":"PAC","monto":5000}')"
expect "error por campo rut" "'RUT inválido (revisa el dígito verificador).'" "$(json errores.rut)"
expect "crear socio -> 201" 201 "$(req POST /socios '{"rut":"16.209.682-6","nombre":"Damian Gelerstein","medio_pago":"PAT","monto":"7.000","proveedor":"Captadora Sur","proveedor_monto":2500,"proveedor_cuotas":6,"proveedor_inicio":"2020-01-01"}')"
ID=$(json dato.id)
expect "rut normalizado" "'16209682-6'" "$(json dato.rut)"
expect "proveedor finalizado" "'finalizado'" "$(json dato.proveedor_estado)"
expect "RUT duplicado -> 422" 422 "$(req POST /socios '{"rut":"16209682-6","nombre":"Otro","medio_pago":"PAC","monto":1000}')"
expect "crear sin CSRF -> 419" 419 "$(CSRF=x req POST /socios '{}')"
expect "ver socio -> 200" 200 "$(req GET /socios/$ID)"
expect "editar socio -> 200" 200 "$(req PUT /socios/$ID '{"rut":"16209682-6","nombre":"Damián Gelerstein","medio_pago":"PAT","monto":8000,"estado":"baja"}')"
expect "monto editado" 8000 "$(json dato.monto)"
expect "fecha de baja automática" "'$(date +%F)'" "$(json dato.fecha_baja)"
expect "socio inexistente -> 404" 404 "$(req GET /socios/9999)"

echo "Importación"
FILAS='{"simular":true,"filas":[
 {"rut":"19081431-9","nombre":"Daniel Villarroel","medio_pago":"Tarjeta","monto":"$1.000"},
 {"rut":"16886595-3","nombre":"Daniela Barrera","medio_pago":"PAT","monto":7000,"fecha_alta":"03/01/2020"},
 {"rut":"16209682-6","nombre":"Damian G","medio_pago":"PAT","monto":9000},
 {"rut":"19081431-9","nombre":"Repetido","medio_pago":"PAT","monto":1000},
 {"rut":"123","nombre":"Malo","medio_pago":"PAC","monto":"abc"}
]}'
expect "simulación -> 200" 200 "$(req POST /socios/importar "$FILAS")"
expect "conteo simulado" '{"crear":2,"actualizar":0,"omitir":1,"error":2}' "$(json conteo)"
expect "devuelve monto interpretado (\$1.000)" 1000 "$(json filas.0.monto)"
expect "devuelve fecha interpretada (03/01/2020)" "'2020-01-03'" "$(json filas.1.fecha_alta)"
req GET '/socios?por_pagina=50' >/dev/null
expect "simular no guarda" 1 "$(json total)"
expect "importar -> 200" 200 "$(req POST /socios/importar "${FILAS/\"simular\":true/\"simular\":false}")"
req GET '/socios?por_pagina=50' >/dev/null
expect "importadas 2 filas válidas" 3 "$(json total)"
expect "actualizar existentes" 200 "$(req POST /socios/importar '{"simular":false,"actualizar_existentes":true,"filas":[{"rut":"16209682-6","monto":9000}]}')"
expect "conteo actualizar" '{"crear":0,"actualizar":1,"omitir":0,"error":0}' "$(json conteo)"
req GET /socios/$ID >/dev/null
expect "actualización parcial conserva nombre" "'Damián Gelerstein'" "$(json dato.nombre)"
expect "actualización parcial cambia monto" 9000 "$(json dato.monto)"
req POST /socios/importar '{"simular":true,"actualizar_existentes":true,"filas":[{"rut":"16209682-6","monto":9000}]}' >/dev/null
expect "fila idéntica se omite (sin cambios)" '{"crear":0,"actualizar":0,"omitir":1,"error":0}' "$(json conteo)"
expect "importar sin filas -> 422" 422 "$(req POST /socios/importar '{"filas":[]}')"
expect "body no JSON -> 400" 400 "$(req POST /socios 'esto no es json')"

echo "Listado y filtros"
req GET '/socios?buscar=daniel' >/dev/null;           expect "buscar por nombre" 2 "$(json total)"
req GET '/socios?buscar=16.886.595' >/dev/null;       expect "buscar por RUT con puntos" 1 "$(json total)"
req GET '/socios?estado=baja' >/dev/null;             expect "filtrar por estado" 1 "$(json total)"
req GET '/socios?medio_pago=PAT&orden=monto&dir=desc' >/dev/null; expect "orden por monto" 9000 "$(json datos.0.monto)"
req GET "/socios?orden=nombre;DROP%20TABLE%20socios" >/dev/null; expect "orden no permitido se ignora" 3 "$(json total)"
req GET "/socios?buscar=%25" >/dev/null;              expect "comodín % escapado" 0 "$(json total)"
expect "resumen activos" 2 "$(json resumen.activos)"
req GET '/socios?monto_min=5000&monto_max=8000' >/dev/null; expect "rango de monto" 1 "$(json total)"
req GET '/socios?monto_min=abc' >/dev/null;           expect "rango inválido se ignora" 3 "$(json total)"
req GET '/socios?estado[]=x' >/dev/null;              expect "parámetro arreglo se ignora" 3 "$(json total)"

echo "Eliminar y cerrar sesión"
expect "eliminar -> 200" 200 "$(req DELETE /socios/$ID)"
expect "eliminar de nuevo -> 404" 404 "$(req DELETE /socios/$ID)"
expect "logout -> 200" 200 "$(req POST /auth/logout)"
expect "tras logout -> 401" 401 "$(req GET /socios)"

echo
if [ $fallos -eq 0 ]; then echo "Todas las pruebas de API pasaron"; else echo "$fallos prueba(s) fallaron"; exit 1; fi
