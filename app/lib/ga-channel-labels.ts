/**
 * Short explanations for GA4 default channel groups shown in project Analytics.
 * Unknown channels fall back to a generic description.
 */

const GA_CHANNEL_TOOLTIPS: Record<string, string> = {
  "Total Traffic": "All sessions across every channel in the selected period.",
  Direct:
    "Visits with no detectable source — typed URL, bookmarks, or apps that strip referrer data.",
  "Organic Search":
    "Unpaid visits from search engines such as Google, Bing, or Yahoo.",
  "Paid Search":
    "Paid search ads (e.g. Google Ads search campaigns).",
  OrganicSocial:
    "Unpaid visits from social networks (Facebook, LinkedIn, Instagram, X, etc.).",
  "Organic Social":
    "Unpaid visits from social networks (Facebook, LinkedIn, Instagram, X, etc.).",
  PaidSocial:
    "Paid visits from social ads.",
  "Paid Social":
    "Paid visits from social ads.",
  Email: "Visits from email campaigns or email links.",
  Referral: "Visits from links on other websites (not search or social).",
  Display: "Visits from display / banner advertising.",
  Affiliates: "Visits attributed to affiliate partners.",
  "Cross-network":
    "Traffic from campaigns that span multiple Google Ads network types.",
  "Audio": "Visits from audio advertising platforms.",
  "Mobile Push Notifications":
    "Visits opened from mobile push notifications.",
  Unassigned:
    "Sessions Google Analytics could not classify into a standard channel.",
}

export function getGaChannelTooltip(channel: string | null | undefined): string {
  const key = (channel ?? "").trim()
  if (!key) return "Traffic channel from Google Analytics."
  return (
    GA_CHANNEL_TOOLTIPS[key]
    ?? `Google Analytics channel group “${key}”.`
  )
}
