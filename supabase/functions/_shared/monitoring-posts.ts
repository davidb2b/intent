import { canonicalProfileUrl } from "./profile-identity.ts"

export const MONITORED_PROFILE_POSTS_ACTOR = "harvestapi/linkedin-profile-posts"

/**
 * Contract for collecting posts from profiles that were explicitly approved
 * for monitoring. Post Search is reserved for broad discovery; Profile Posts
 * receives the known profile URLs through `targetUrls`.
 */
export function buildMonitoredProfilePostsInput(linkedinUrls: string[], janela: string) {
  const targetUrls = [...new Set(linkedinUrls.map(canonicalProfileUrl).filter(Boolean))]
  return {
    targetUrls,
    maxPosts: 200,
    postedLimit: janela,
    scrapeComments: false,
    scrapeReactions: false,
  }
}
