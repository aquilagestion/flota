/**
 * Reconstruye el estado del formulario de gasto desde un registro local/remoto
 * (tras gasto_list / sync) para que Editar conserve entidad, proveedor, tickets, etc.
 */
import { ticketFetchUrlForEmbed, ticketUrlToDataUri_, ticketUrlsFromExpenseRecord } from "./expenseTicketResolve";

function fillIfEmpty_(obj, key, value) {
  const v = String(value || "").trim();
  if (!v) return;
  if (!String(obj[key] || "").trim()) obj[key] = v;
}

/** Mapea columnas genéricas del Sheet a campos tipados del formulario. */
export function hydrateExpenseFormFromRecord(raw) {
  const e = { ...(raw || {}) };
  const tipo = String(e.tipo_gasto || "").trim().toUpperCase();
  const fecha = String(e.fecha || "").trim();
  const importe = String(e.importe || e.coste_total || "").trim();
  const proveedor = String(e.proveedor || "").trim();

  const fechaByTipo = {
    COMBUSTIBLES: "fecha_repostaje",
    PEAJES: "fecha_peaje",
    PARKING: "fecha_aparcamiento",
    GASTOS_BILLETES: "fecha_ida_billete",
    // Formulario usa fecha_otros_gastos para HOSPEDAJE/MANUTENCION/OTROS
    HOSPEDAJE: "fecha_otros_gastos",
    MANUTENCION: "fecha_otros_gastos",
    ITV: "fecha_inspeccion",
    REPUESTOS_RECAMBIO: "fecha_compra_repuestos",
    MANTENIMIENTO_REPARACIONES: "fecha_compra_mantenimiento",
    OTROS: "fecha_otros_gastos",
    MULTAS_SANCIONES: "fecha_multa",
    MULTAS: "fecha_multa",
    KILOMETRAJE_COLABORADOR: "fecha_viaje_colaborador",
    SEGUROS: "fecha_inicio_seguro",
    SEGURO: "fecha_inicio_seguro",
    IMPUESTOS: "periodo_ivm",
    OTROS_IMPUESTOS: "fecha_pago",
  };
  const importeByTipo = {
    COMBUSTIBLES: "total_a_pagar",
    PEAJES: "importe_peaje",
    PARKING: "importe_aparcamiento",
    GASTOS_BILLETES: "precio_total_billete",
    HOSPEDAJE: "importe_otros_gastos",
    MANUTENCION: "importe_otros_gastos",
    ITV: "importe_itv",
    REPUESTOS_RECAMBIO: "importe_repuestos",
    MANTENIMIENTO_REPARACIONES: "importe_mantenimiento",
    OTROS: "importe_otros_gastos",
    MULTAS_SANCIONES: "importe_multa",
    MULTAS: "importe_multa",
    SEGUROS: "prima",
    SEGURO: "prima",
    IMPUESTOS: "importe_ivm",
    OTROS_IMPUESTOS: "importe_otros_impuestos",
    KILOMETRAJE_COLABORADOR: "importe_km_colaborador",
  };

  const fk = fechaByTipo[tipo];
  if (fk && fecha) {
    // Canónica manda: evita tipada stale del Sheet al reabrir tras editar.
    e[fk] = fecha;
  }
  const ik = importeByTipo[tipo];
  if (ik) fillIfEmpty_(e, ik, importe);
  // Alias importe_repostaje (legacy) → total_a_pagar
  if (tipo === "COMBUSTIBLES") {
    fillIfEmpty_(e, "total_a_pagar", e.importe_repostaje);
    fillIfEmpty_(e, "importe_repostaje", e.total_a_pagar);
  }

  if (!String(e.matricula || "").trim() && e.vehiclePlate) e.matricula = e.vehiclePlate;

  switch (tipo) {
    case "COMBUSTIBLES":
      fillIfEmpty_(e, "entidad_combustible", e.lugar_repostaje || proveedor || e.marca_combustible || e.marca);
      fillIfEmpty_(e, "lugar_repostaje", e.entidad_combustible || proveedor);
      fillIfEmpty_(e, "marca_combustible", e.marca);
      fillIfEmpty_(e, "numero_ticket", e.concepto);
      break;
    case "PARKING":
      fillIfEmpty_(e, "entidad_parking", proveedor);
      break;
    case "PEAJES":
      fillIfEmpty_(e, "entidad_peaje", proveedor);
      fillIfEmpty_(e, "numero_factura_peaje", e.numero_factura || e.numero_ticket || e.concepto);
      break;
    case "GASTOS_BILLETES":
      fillIfEmpty_(e, "compania_billete", proveedor);
      fillIfEmpty_(e, "numero_reserva_billete", e.numero_factura_otros || e.numero_factura || e.numero_ticket);
      fillIfEmpty_(e, "concepto_billete", e.concepto);
      fillIfEmpty_(
        e,
        "numero_personas_billete",
        e.numero_personas_billete || e.num_personas || e.numero_personas_hospedaje
      );
      if (!String(e.precio_total_billete || "").trim()) {
        const tasasN = Number(String(e.tasas_billete || "0").replace(",", ".")) || 0;
        const totalN = Number(String(importe || "0").replace(",", ".")) || 0;
        if (tasasN > 0 && totalN > tasasN) {
          fillIfEmpty_(e, "precio_total_billete", String(Math.round((totalN - tasasN) * 100) / 100));
        } else {
          fillIfEmpty_(e, "precio_total_billete", importe);
        }
      }
      if (!String(e.origen_billete || "").trim() || !String(e.destino_billete || "").trim()) {
        const concept = String(e.concepto_billete || e.concepto || "").trim();
        const parts = concept.split(/\s*(?:->|→)\s*/);
        if (parts.length >= 2) {
          fillIfEmpty_(e, "origen_billete", parts[0]);
          fillIfEmpty_(e, "destino_billete", parts.slice(1).join(" -> "));
        }
      }
      break;
    case "ITV":
      fillIfEmpty_(e, "estacion_itv", proveedor || e.concepto);
      fillIfEmpty_(e, "importe_itv", importe);
      break;
    case "REPUESTOS_RECAMBIO":
      fillIfEmpty_(e, "proveedor_repuestos", proveedor);
      fillIfEmpty_(e, "descripcion_repuestos", e.concepto);
      break;
    case "MANTENIMIENTO_REPARACIONES":
      fillIfEmpty_(e, "proveedor_mantenimiento", proveedor);
      fillIfEmpty_(e, "descripcion_mantenimiento", e.concepto);
      break;
    case "OTROS":
    case "HOSPEDAJE":
    case "MANUTENCION":
      fillIfEmpty_(
        e,
        "proveedor_otros_gastos",
        e.entidad_hospedaje || e.establecimiento_manutencion || proveedor
      );
      fillIfEmpty_(e, "entidad_hospedaje", e.proveedor_otros_gastos || proveedor);
      fillIfEmpty_(e, "establecimiento_manutencion", e.proveedor_otros_gastos || proveedor);
      fillIfEmpty_(e, "concepto_otros_gastos", e.concepto);
      fillIfEmpty_(e, "fecha_otros_gastos", e.fecha_entrada_hospedaje || e.fecha_manutencion || fecha);
      fillIfEmpty_(e, "importe_otros_gastos", e.importe_hospedaje || e.importe_manutencion || importe);
      break;
    case "IMPUESTOS":
      fillIfEmpty_(e, "periodo_ivm", fecha || e.periodo_ivm);
      fillIfEmpty_(e, "importe_ivm", importe);
      break;
    case "OTROS_IMPUESTOS":
      fillIfEmpty_(e, "fecha_pago", fecha);
      fillIfEmpty_(e, "tipo_otro_impuesto", e.tipo_impuesto || e.tipo_impuesto_otro || e.concepto);
      fillIfEmpty_(e, "importe_otros_impuestos", importe);
      break;
    case "SEGURO":
    case "SEGUROS":
      fillIfEmpty_(e, "compania", proveedor);
      fillIfEmpty_(e, "cobertura", e.concepto);
      fillIfEmpty_(e, "prima", importe);
      fillIfEmpty_(e, "numero_poliza", e.poliza);
      break;
    case "MULTAS":
    case "MULTAS_SANCIONES":
      fillIfEmpty_(e, "organismo_denunciante", proveedor);
      fillIfEmpty_(e, "tipo_infraccion", e.concepto);
      fillIfEmpty_(e, "importe_multa", e.importe || importe);
      fillIfEmpty_(e, "conductor_multa", e.conductor);
      fillIfEmpty_(e, "lugar_multa", e.lugar);
      break;
    case "KILOMETRAJE_COLABORADOR":
      fillIfEmpty_(e, "proyecto_colaborador_id", e.id_proyecto);
      fillIfEmpty_(e, "proyecto_colaborador_nombre", e.proyecto_nombre || e.departamento_o_proyecto);
      break;
    default:
      break;
  }

  // Tickets: si no hay locales, dejar lista de URLs (Drive / remotas) para preview/abrir.
  const localUris = Array.isArray(e.ticketLocalUris)
    ? e.ticketLocalUris.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  if (!localUris.length) {
    const remote = ticketUrlsFromExpenseRecord(e).filter(
      (u) => !String(u).startsWith("file:") && !String(u).startsWith("content:")
    );
    if (remote.length) {
      // Conservar URLs originales (hydrateExpenseTicketPreviews_ las convertirá a data URI).
      e.ticketLocalUris = remote;
    }
  }

  return e;
}

function isDriveHostUrl_(url) {
  const u = String(url || "").trim().toLowerCase();
  return u.includes("drive.google.com") || u.includes("googleusercontent.com");
}

/** Convierte tickets Drive a data URI (web/APK) para que ImageField los muestre. */
export async function hydrateExpenseTicketPreviews_(expense, { apiGet, userEmail } = {}) {
  const base = hydrateExpenseFormFromRecord(expense);
  // Preferir ticketLocalUris ya presentes (p. ej. tras quitar adjuntos); no mezclar de nuevo con Drive.
  const localUris = Array.isArray(base.ticketLocalUris)
    ? base.ticketLocalUris.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  const urls = localUris.length ? localUris : ticketUrlsFromExpenseRecord(base);
  if (!urls.length) return base;

  const out = [];
  for (const url of urls) {
    const s = String(url || "").trim();
    if (!s) continue;
    if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("file:") || s.startsWith("content:")) {
      out.push(s);
      continue;
    }
    try {
      const dataUri = await ticketUrlToDataUri_(s, { apiGet, userEmail });
      if (dataUri && String(dataUri).startsWith("data:")) {
        out.push(dataUri);
        continue;
      }
      // data URI falló: conservar URL original para «Abrir tiquet» (ImageField).
      // No usar uc?export=view de Drive: suele fallar por CORS y deja preview rota.
      if (dataUri && !isDriveHostUrl_(dataUri)) {
        out.push(dataUri);
        continue;
      }
    } catch {
      /* fallback */
    }
    const embed = ticketFetchUrlForEmbed(s);
    if (embed && !isDriveHostUrl_(embed)) {
      out.push(embed);
      continue;
    }
    // Drive u otra URL remota: conservar para abrir en navegador aunque no haya miniatura.
    out.push(s);
  }
  return {
    ...base,
    ticketLocalUris: out.length ? out : base.ticketLocalUris || [],
  };
}

/**
 * Alias de entidad/proveedor/concepto para el payload de guardado/sync.
 * Asegura que GASTOS.proveedor y columnas tipadas queden rellenadas desde el formulario.
 */
export function buildExpenseEntityAliases_(form) {
  const f = form || {};
  const tipo = String(f.tipo_gasto || "")
    .trim()
    .toUpperCase();
  const out = {};
  switch (tipo) {
    case "COMBUSTIBLES": {
      const entidad = String(f.entidad_combustible || "").trim();
      const lugar = String(f.lugar_repostaje || "").trim() || entidad;
      out.entidad_combustible = entidad;
      out.lugar_repostaje = lugar;
      out.proveedor = entidad || lugar;
      out.marca = String(f.marca_combustible || f.marca || "").trim();
      out.concepto = String(f.numero_ticket || f.concepto || out.marca || "").trim();
      break;
    }
    case "PARKING": {
      const entidad = String(f.entidad_parking || "").trim();
      out.entidad_parking = entidad;
      out.proveedor = entidad || String(f.proveedor || "").trim();
      out.concepto = String(f.tipo_zona || f.concepto || "").trim();
      break;
    }
    case "PEAJES": {
      const entidad = String(f.entidad_peaje || "").trim();
      out.entidad_peaje = entidad;
      out.proveedor = entidad || String(f.proveedor || "").trim();
      const entrada = String(f.entrada_peaje || "").trim();
      const salida = String(f.salida_peaje || "").trim();
      out.concepto = String(f.concepto || "").trim() || (entrada || salida ? `${entrada} -> ${salida}` : "");
      out.numero_factura_peaje = String(f.numero_factura_peaje || "").trim();
      break;
    }
    case "GASTOS_BILLETES": {
      const compania = String(f.compania_billete || f.proveedor || "").trim();
      const origen = String(f.origen_billete || "").trim();
      const destino = String(f.destino_billete || "").trim();
      out.compania_billete = compania;
      out.proveedor = compania;
      out.concepto = String(f.concepto_billete || f.concepto || "").trim() || [origen, destino].filter(Boolean).join(" -> ");
      out.concepto_billete = out.concepto;
      out.numero_reserva_billete = String(f.numero_reserva_billete || f.numero_factura_otros || "").trim();
      out.numero_factura_otros = out.numero_reserva_billete;
      out.numero_personas_billete = String(f.numero_personas_billete || f.num_personas || "").trim();
      out.tasas_billete = String(f.tasas_billete || "").trim();
      out.precio_total_billete = String(f.precio_total_billete || "").trim();
      break;
    }
    case "ITV":
      out.proveedor = String(f.estacion_itv || f.proveedor || "").trim();
      out.concepto = String(f.estacion_itv || f.concepto || "").trim();
      break;
    case "REPUESTOS_RECAMBIO":
      out.proveedor = String(f.proveedor_repuestos || f.proveedor || "").trim();
      out.concepto = String(f.descripcion_repuestos || f.concepto || "").trim();
      break;
    case "MANTENIMIENTO_REPARACIONES":
      out.proveedor = String(f.proveedor_mantenimiento || f.proveedor || "").trim();
      out.concepto = String(f.descripcion_mantenimiento || f.concepto || "").trim();
      break;
    case "OTROS":
    case "HOSPEDAJE":
    case "MANUTENCION":
      out.proveedor = String(
        f.proveedor_otros_gastos || f.entidad_hospedaje || f.establecimiento_manutencion || f.proveedor || ""
      ).trim();
      out.proveedor_otros_gastos = out.proveedor;
      out.concepto = String(
        f.concepto_otros_gastos || f.concepto || (tipo === "HOSPEDAJE" ? "Hospedaje" : tipo === "MANUTENCION" ? "Manutención" : "")
      ).trim();
      break;
    case "SEGURO":
    case "SEGUROS":
      out.proveedor = String(f.compania || f.proveedor || "").trim();
      out.concepto = String(f.cobertura || f.concepto || "").trim();
      out.poliza = String(f.numero_poliza || f.poliza || "").trim();
      break;
    case "MULTAS":
    case "MULTAS_SANCIONES":
      out.proveedor = String(f.organismo_denunciante || f.proveedor || "").trim();
      out.concepto = String(f.tipo_infraccion || f.concepto || "").trim();
      break;
    case "IMPUESTOS":
      out.concepto = String(f.periodo_ivm || f.concepto || "I.V.M.").trim();
      out.proveedor = String(f.proveedor || "IVM").trim();
      break;
    case "OTROS_IMPUESTOS":
      out.concepto = String(f.tipo_otro_impuesto || f.tipo_impuesto || f.concepto || "").trim();
      out.proveedor = String(f.proveedor || out.concepto || "IMPUESTO").trim();
      break;
    case "KILOMETRAJE_COLABORADOR":
      out.proveedor = String(f.accion_colaborador || f.proveedor || "COLABORADOR").trim();
      out.concepto = String(
        f.motivo_colaborador ||
          f.concepto ||
          `${String(f.origen_colaborador || "").trim()} -> ${String(f.destino_colaborador || "").trim()}`
      ).trim();
      break;
    default:
      break;
  }
  return out;
}
