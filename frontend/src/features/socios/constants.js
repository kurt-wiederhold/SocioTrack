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

// Rangos para sectorizar la base de cobro. La Fundación puede ajustarlos aquí.
export const RANGOS_MONTO = [
  { label: 'Hasta $4.999', min: 0, max: 4999 },
  { label: '$5.000 – $9.999', min: 5000, max: 9999 },
  { label: '$10.000 – $19.999', min: 10000, max: 19999 },
  { label: '$20.000 o más', min: 20000, max: null },
]
