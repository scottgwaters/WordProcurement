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
  "body",
  "clothing",
  "colors",
  "family",
  "feelings",
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
