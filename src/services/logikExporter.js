// ─── logikExporter ────────────────────────────────────────────────────────────
// Triggers a browser download of the LOGIK standalone app ZIP.
// The zip is served as a static asset from /public/logik-standalone.zip.

export function downloadLogikZip() {
  const a = document.createElement('a')
  a.href = '/logik-standalone.zip'
  a.download = 'logik-standalone.zip'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
