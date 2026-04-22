export const REVIEW_SEVERITIES = ["low", "medium", "high", "critical"] as const
export const REVIEW_CATEGORIES = ["bug", "security", "performance", "style", "compliance", "architecture"] as const
export const TRIAGE_VERDICTS = ["actionable", "deferred", "dismissed"] as const

export const REVIEW_SEVERITY_SET = new Set<string>(REVIEW_SEVERITIES)
export const REVIEW_CATEGORY_SET = new Set<string>(REVIEW_CATEGORIES)
export const TRIAGE_VERDICT_SET = new Set<string>(TRIAGE_VERDICTS)
