export const ESTADOS = {
  activo: { label: 'Activo', color: 'green' },
  suspendido: { label: 'Suspendido', color: 'yellow' },
  baja: { label: 'Baja', color: 'gray' },
}

export const MEDIOS = {
  PAC: { label: 'PAC', detalle: 'Cargo en cuenta bancaria', color: 'blue' },
  PAT: { label: 'PAT', detalle: 'Tarjeta (Transbank)', color: 'brand' },
}

export const PROVEEDOR_ESTADOS = {
  pagando: { label: 'Pagando a proveedor', color: 'yellow' },
  ultimo_mes: { label: 'Último mes proveedor', color: 'red' },
  finalizado: { label: '100% Fundación', color: 'green' },
}

export const BANCOS = [
  'Banco de Chile', 'BancoEstado', 'Banco Santander', 'Banco BCI', 'Scotiabank', 'Banco Itaú',
  'Banco BICE', 'Banco Security', 'Banco Falabella', 'Banco Ripley', 'Banco Consorcio', 'Banco Internacional', 'Coopeuch',
]

/** Estado del cobro del mes actual de cada socio. */
export const COBRO_MES = {
  cobrado: { label: 'Cobrado', color: 'green' },
  pendiente: { label: 'Esperando respuesta', color: 'yellow' },
  rechazado: { label: 'Rechazado', color: 'red' },
  sin_enviar: { label: 'Sin enviar', color: 'gray' },
}
