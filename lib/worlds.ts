// Game world definitions — mirrored from Wordnauts/ThemeManager.worldId(for:).
// Reviewers need to see which in-game world a word will appear in, since
// the DB `category` field is finer-grained than the 7 game worlds.

export type WorldId = "animals" | "food" | "nature" | "space" | "objects" | "magic" | "sight";

export interface World {
  id: WorldId;
  name: string;
  tagline: string;
  emoji: string;
}

export const WORLDS: Record<WorldId, World> = {
  animals: { id: "animals", name: "Animal Kingdom",    tagline: "Wild creatures, pets & bugs",    emoji: "🐾" },
  food:    { id: "food",    name: "Kitchen Quest",     tagline: "Food, drinks & kitchen fun",     emoji: "🧁" },
  nature:  { id: "nature",  name: "Nature Trail",      tagline: "Outdoors, weather & earth",      emoji: "🌳" },
  space:   { id: "space",   name: "Star Mission",      tagline: "Planets, stars & rockets",       emoji: "🚀" },
  objects: { id: "objects", name: "Treasure Hunt",     tagline: "Everyday things around you",     emoji: "🎁" },
  magic:   { id: "magic",   name: "Enchanted Words",   tagline: "Unicorns, wizards & fairy tales", emoji: "✨" },
  sight:   { id: "sight",   name: "Sight Word School", tagline: "Common words for faster reading", emoji: "📖" },
};

export interface WorldAssignment {
  world: World | null;       // null when the category is ambiguous
  ambiguous: boolean;        // true when app falls back to random/hash pick
  note?: string;             // advice for the reviewer
}

// Keep this in sync with WordEntry.worldId (Swift) and ThemeManager.worldId(for:).
// When either changes, update both places.
export function worldForCategory(category: string): WorldAssignment {
  switch (category) {
    case "sight_words":
    case "heart_words":
      return { world: WORLDS.sight, ambiguous: false };
    case "animals":
    case "family":
    case "people":
      return { world: WORLDS.animals, ambiguous: false };
    case "food":
    case "body":
      return { world: WORLDS.food, ambiguous: false };
    case "nature":
    case "weather":
    case "sports":
      return { world: WORLDS.nature, ambiguous: false };
    case "space":
    case "science":
      return { world: WORLDS.space, ambiguous: false };
    case "objects":
    case "clothing":
    case "transport":
    case "home":
      return { world: WORLDS.objects, ambiguous: false };
    case "concepts":
    case "adventure":
    case "feelings":
    case "music_arts":
    case "magic":
      return { world: WORLDS.magic, ambiguous: false };
    // Ambiguous: app picks one of several worlds at random/hash
    case "actions":
    case "action_verbs":
    case "descriptive":
    case "descriptive_words":
    case "common":
    case "common_nouns":
    case "school":
    case "colors":
    case "places":
    case "time":
    case "position_words":
    case "question_words":
    case "connecting_words":
    case "quantity_words":
    case "compound_words":
    case "contractions":
      return {
        world: null,
        ambiguous: true,
        note: "This category has no single world — the game picks one at random. Consider re-categorizing to a world-specific category.",
      };
    default:
      return {
        world: null,
        ambiguous: true,
        note: "Unknown category — the game will fall back to Animal Kingdom. Re-categorize for correct world placement.",
      };
  }
}
