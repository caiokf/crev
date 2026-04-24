/**
 * Some runtime CLIs (notably mastracode) print a multi-line TUI
 * banner with hook info, ASCII-art, and stray control bytes when
 * invoked with `--version`. Valet captures the whole blob as the
 * `version` string; if we render it raw the doctor report gets
 * disfigured. Prefer a clean semver if one can be found, else fall
 * back to the first printable line, else an em-dash placeholder.
 */
export function sanitizeVersion(raw: string | null | undefined): string {
  if (!raw) return "–"
  const stripped = stripControl(raw)
  const semver = stripped.match(/\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?/)
  if (semver) return semver[0]
  const firstLine = stripped
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  return firstLine ? firstLine.slice(0, 20) : "–"
}

export function sanitizeDetail(raw: string): string {
  const firstLine = stripControl(raw).split("\n")[0].trim()
  return firstLine || "–"
}

function stripControl(s: string): string {
  // Strip ANSI escapes and non-printable control bytes (keep \n/\t
  // so split/trim can still see real line breaks).
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;?]*[a-zA-Z]|\x1B\][^\x07]*\x07/g, "").replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0B-\x1F\x7F]/g,
    "",
  )
}
