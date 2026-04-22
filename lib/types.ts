// Word data types for Word Procurement

export type AgeGroup = "4-6" | "7-9" | "10-12";
export type Level = 1 | 2 | 3;

export interface Hints {
  easy: string;
  medium: string;
  hard: string;
}

export interface Word {
  id: string;
  word: string;
  age_group: AgeGroup;
  level: Level;
  category: string;
  word_length: number;
  hints: Hints | null;
  // Educational metadata
  pronunciation: string | null;
  part_of_speech: string | null;
  definition: string | null;
  example_sentence: string | null;
  heart_word_explanation: string | null;
  // Tracking
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  /** Soft-delete marker. Declined words are hidden from the default queue. */
  declined?: boolean;
  /** Present on list responses — derived from activity_log on the server. */
  flagged?: boolean;
  created_at: string;
  created_by: string | null;
  source: string | null;
}

export interface ActivityLog {
  id: string;
  word_id: string;
  user_id: string;
  action: "created" | "verified" | "rejected" | "edited";
  details: Record<string, unknown> | null;
  created_at: string;
}

// Activity change tracking for audit history
export interface ActivityChange {
  old: unknown;
  new: unknown;
}

export interface ActivityChanges {
  [field: string]: ActivityChange;
}

// Activity log with user info for display
export interface ActivityLogWithUser extends ActivityLog {
  user_email: string | null;
  words?: { word: string } | null;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

// Stats for dashboard
export interface DashboardStats {
  totalWords: number;
  verifiedWords: number;
  unverifiedWords: number;
  wordsByCategory: Record<string, number>;
  wordsByAgeGroup: Record<AgeGroup, number>;
  recentActivity: ActivityLog[];
}

// Filter options for word list
export interface WordFilters {
  category?: string;
  ageGroup?: AgeGroup;
  level?: Level;
  verified?: boolean;
  /** True when the "Flagged" status option is selected. Flag state is
   *  computed from activity_log on the server. Mutually exclusive with
   *  `verified` in the UI — selecting "Flagged" clears verified. */
  flagged?: boolean;
  /** True when the "Declined" status option is selected — surfaces the
   *  soft-deleted pool so admins can un-decline if they change their mind. */
  declined?: boolean;
  search?: string;
}

// AI generated hints response
export interface GeneratedHints {
  hints: Hints;
  definition: string;
  example_sentence: string;
  part_of_speech: string;
}

// Categories available in the word list
export const CATEGORIES = [
  "sight_words",
  "heart_words",
  "animals",
  "food",
  "nature",
  "space",
  "objects",
  "magic",
  "feelings",
  "concepts",
  "adventure",
  "music_arts",
  "people",
  "science",
  "body",
  "clothing",
  "colors",
  "family",
  "home",
  "places",
  "school",
  "sports",
  "time",
  "transport",
  "weather",
  "action_verbs",
  "descriptive_words",
  "common_nouns",
  "position_words",
  "question_words",
  "connecting_words",
  "quantity_words",
  "compound_words",
  "contractions",
] as const;

export type Category = (typeof CATEGORIES)[number];
