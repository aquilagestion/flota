function normalizeRol_(rol) {
  const v = String(rol || "")
    .trim()
    .toUpperCase();
  if (v !== "GESTOR" && v !== "RESPONSABLE" && v !== "OPERARIO" && v !== "ADMINISTRACION" && v !== "ADMIN") {
    return "OPERARIO";
  }
  if (v === "ADMIN") return "ADMINISTRACION";
  return v;
}

function getUsuarioByEmail_(email) {
  const target = String(email || "")
    .trim()
    .toLowerCase();
  if (!target) return null;

  const sh = getSheet(CFG.SHEETS.USUARIOS);
  const rows = rowsToObjects_(sh);

  const row = rows.find(
    (r) =>
      String(r.email || "")
        .trim()
        .toLowerCase() === target &&
      String(r.activo || "")
        .trim()
        .toUpperCase() === "SI"
  );

  if (!row) return null;

  return {
    email: String(row.email || "")
      .trim()
      .toLowerCase(),
    nombre: String(row.nombre || "").trim(),
    rol: normalizeRol_(row.rol),
    activo: String(row.activo || "")
      .trim()
      .toUpperCase(),
  };
}

function requireRolGestor_(email) {
  const u = getUsuarioByEmail_(email);
  if (!u) throw new Error("Usuario no encontrado o inactivo");
  if (u.rol !== "GESTOR") {
    throw new Error("Permiso denegado: requiere rol GESTOR");
  }
  return u;
}

function requireUsuarioActivo_(email) {
  const u = getUsuarioByEmail_(email);
  if (!u) throw new Error("Usuario no encontrado o inactivo");
  return u;
}
