import type Widgets from "blessed"

/**
 * Shared blessed style fragments for the dash. Colors are kept close
 * to the existing chalk theme so CLI and dash feel like one product.
 *
 * Blessed uses its own tag syntax for inline colors ({red-fg}...{/}),
 * but most of our UI is structured — we pass these style objects into
 * widget constructors instead of hand-tagging strings.
 */

export const DASH_COLORS = {
  accent: "cyan",
  muted: "gray",
  border: "gray",
  focusedBorder: "cyan",
  selectedBg: "blue",
  selectedFg: "white",
  danger: "red",
  warn: "yellow",
  ok: "green",
} as const

export const LIST_STYLE: Widgets.Widgets.ListOptions<Widgets.Widgets.ListElementStyle>["style"] = {
  border: { fg: DASH_COLORS.border },
  selected: { bg: DASH_COLORS.selectedBg, fg: DASH_COLORS.selectedFg, bold: true },
  item: { fg: "white" },
  focus: { border: { fg: DASH_COLORS.focusedBorder } },
}

export const BOX_STYLE: Widgets.Widgets.BoxOptions["style"] = {
  border: { fg: DASH_COLORS.border },
  focus: { border: { fg: DASH_COLORS.focusedBorder } },
}

export const STATUSLINE_STYLE = {
  fg: DASH_COLORS.muted,
  bg: "black",
} as const

export const HEADER_STYLE = {
  fg: DASH_COLORS.accent,
  bold: true,
} as const

/**
 * Escape `{` / `}` in user-controlled strings so blessed (with
 * `tags: true`) doesn't interpret them as color/style directives.
 * Mirrors `blessed.helpers.escape` — reproduced here so we don't
 * couple every call site to the shim's runtime shape.
 */
export function escapeTags(text: string): string {
  return text.replace(/[{}]/g, (ch) => (ch === "{" ? "{open}" : "{close}"))
}
