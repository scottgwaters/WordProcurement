// Game world definitions — mirrored from Wordnauts/ThemeManager.worldId(for:).
// Reviewers need to see which in-game world a word will appear in, since
// the DB `category` field is finer-grained than the 7 game worlds.

export type WorldId = "animals" | "food" | "nature" | "space" | "objects" | "magic" | "sight" | "feelings";

export interface World {
  id: WorldId;
  name: string;
  tagline: string;
  /** One or two sentences explaining what belongs in this world. Shown as a
   *  tooltip on world badges and as help text on the edit page so reviewers
   *  can disambiguate edge-case words. */
  description: string;
  emoji: string;
}

export const WORLDS: Record<WorldId, World> = {
  animals: {
    id: "animals",
    name: "Animal Kingdom",
    tagline: "Wild creatures, pets & bugs",
    description:
      "Living creatures and the humans around them — pets, wild animals, insects, plus family and people words (mom, friend, baby). Anything that breathes.",
    emoji: "🐾",
  },
  food: {
    id: "food",
    name: "Kitchen Quest",
    tagline: "Food, drinks & kitchen fun",
    description:
      "Edible things, cooking, and the body — food, drinks, meals, kitchen items, and body parts like hand, foot, tooth.",
    emoji: "🧁",
  },
  nature: {
    id: "nature",
    name: "Nature Trail",
    tagline: "Outdoors, weather & earth",
    description:
      "The outdoors — plants, trees, landscapes, weather, seasons, and outdoor sports or activities (hike, swim, camp).",
    emoji: "🌳",
  },
  space: {
    id: "space",
    name: "Star Mission",
    tagline: "Planets, stars & rockets",
    description:
      "Space and science — planets, stars, rockets, astronauts, plus broader science concepts (atom, magnet, gravity).",
    emoji: "🚀",
  },
  objects: {
    id: "objects",
    name: "Treasure Hunt",
    tagline: "Everyday things around you",
    description:
      "Man-made objects — household items, furniture, clothing, vehicles, tools. Things kids touch and use every day.",
    emoji: "🎁",
  },
  magic: {
    id: "magic",
    name: "Enchanted Words",
    tagline: "Unicorns, wizards & fairy tales",
    description:
      "Imagination and creativity — magic, fairy tales, adventure, music and the arts, and abstract concepts (dream, idea, story).",
    emoji: "✨",
  },
  sight: {
    id: "sight",
    name: "Sight Word School",
    tagline: "Common words for faster reading",
    description:
      "High-frequency sight words and heart words — the building blocks of early reading (the, you, said, because). These don't fit a theme; they're taught for recognition.",
    emoji: "📖",
  },
  feelings: {
    id: "feelings",
    name: "Feelings Forest",
    tagline: "Emotions & how we feel",
    description:
      "Emotions and emotional states — happy, scared, proud, lonely. Words that name what's going on inside.",
    emoji: "💗",
  },
};

// Inverse of worldForCategory — used to group/filter categories by world.
// Keep in sync with the switch statement below.
export const CATEGORIES_BY_WORLD: Record<WorldId, string[]> = {
  sight:    ["sight_words", "heart_words"],
  animals:  ["animals", "family", "people"],
  food:     ["food", "body"],
  nature:   ["nature", "weather", "sports"],
  space:    ["space", "science"],
  objects:  ["objects", "clothing", "transport", "home"],
  magic:    ["concepts", "adventure", "music_arts", "magic"],
  feelings: ["feelings"],
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
    case "feelings":
      return { world: WORLDS.feelings, ambiguous: false };
    case "concepts":
    case "adventure":
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
