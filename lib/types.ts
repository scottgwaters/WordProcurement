// Word data types for Word Procurement

export type AgeGroup = "4-6" | "7-9" | "10-12";
export type GradeLevel = "k" | "1" | "2" | "3" | "4";
export type Level = 1 | 2 | 3;

export const GRADE_LEVELS: GradeLevel[] = ["k", "1", "2", "3", "4"];

export const GRADE_LEVEL_LABEL: Record<GradeLevel, string> = {
  k: "K",
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
};

export interface Hints {
  easy: string;
  medium: string;
  hard: string;
}

export interface Word {
  id: string;
  word: string;
  age_group: AgeGroup;
  grade_level: GradeLevel | null;
  level: Level;
  category: string;
  word_length: number;
  hints: Hints | null;
  // Educational metadata. Three pronunciation fields are populated together
  // by the build-time generator (see PRONUNCIATION.md): IPA is the canonical
  // source of truth, ARPAbet is the CMUdict intermediate, and the respelling
  // is what the iOS UI shows under the word. Curators can override any one.
  pronunciation: string | null;
  pronunciation_arpabet: string | null;
  pronunciation_respelling: string | null;
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
  action: "created" | "verified" | "rejected" | "edited" | "flagged" | "unflagged";
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

// Filter options for word list. Worlds replaced the old fine-grained
// category dimension; the `world` field is carried alongside this type
// via intersection where needed (see /words, /review).
export interface WordFilters {
  ageGroup?: AgeGroup;
  gradeLevel?: GradeLevel;
  /** Match words whose grade_level is null (ungraded). Mutually exclusive
   *  with `gradeLevel` in the UI. */
  ungraded?: boolean;
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
