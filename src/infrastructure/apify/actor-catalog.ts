export const APIFY_ACTORS = {
  postSearch: "harvestapi/linkedin-post-search",
  postComments: "harvestapi/linkedin-post-comments",
  profileDetails: "apimaestro/linkedin-profile-detail",
  commentsFallbackCandidate:
    "apimaestro/linkedin-post-comments-replies-engagements-scraper-no-cookies",
} as const;

export const APIFY_INPUT_DEFAULTS = {
  discovery: {
    maxPosts: 100,
    postedLimit: "3months",
    sortBy: "relevance",
    scrapeComments: false,
    scrapeReactions: false,
  },
  weeklyMonitoring: {
    maxPosts: 200,
    postedLimit: "month",
    scrapeComments: false,
    scrapeReactions: false,
  },
  backfillMonitoring: {
    maxPosts: 200,
    postedLimit: "3months",
    scrapeComments: false,
    scrapeReactions: false,
  },
  comments: {
    maxItems: 200,
    postedLimit: "month",
    scrapeReplies: false,
    profileScraperMode: "main",
  },
} as const;
