/** Compara semver tipo 1.2.3. Devuelve -1 si a<b, 0 si igual, 1 si a>b. */
export function compareSemver(a, b) {
  const pa = parseSemverParts_(a);
  const pb = parseSemverParts_(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function isRemoteVersionNewer(localVersion, remoteVersion) {
  return compareSemver(String(localVersion || "").trim(), String(remoteVersion || "").trim()) < 0;
}

function parseSemverParts_(value) {
  const s = String(value || "").trim().replace(/^v/i, "");
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
