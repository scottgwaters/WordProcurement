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
      "Living creatures — mammals, birds, fish, reptiles, insects, their body coverings (shell, web), and collective terms (herd, swarm).",
    emoji: "🐾",
  },
  food: {
    id: "food",
    name: "Kitchen Quest",
    tagline: "Food, drinks & kitchen fun",
    description:
      "Edibles and kitchen-world items — fruits, vegetables, meats, drinks, prepared dishes, cookware, and utensils (pot, pan, plate).",
    emoji: "🍕",
  },
  nature: {
    id: "nature",
    name: "Nature Trail",
    tagline: "Outdoors, weather & earth",
    description:
      "The outdoors — landforms, weather, natural materials (wood, rock, glass), plants, seasons, and ecological processes.",
    emoji: "🌿",
  },
  space: {
    id: "space",
    name: "Star Mission",
    tagline: "Planets, stars & rockets",
    description:
      "Astronomy and physical science — planets, stars, rockets, physics concepts (gravity, energy), and lab tools (telescope, beaker).",
    emoji: "🚀",
  },
  objects: {
    id: "objects",
    name: "Around the House",
    tagline: "Everyday things around you",
    description:
      "Man-made household things — furniture, tools, school supplies, toys, clothes, containers, electronics, vehicles. Not kitchen-specific; not raw materials.",
    emoji: "🏠",
  },
  magic: {
    id: "magic",
    name: "Once Upon a Time",
    tagline: "Knights, dragons & fairy tales",
    description:
      "Fairy tales and adventures — magic creatures, wizards, fairy-tale figures (king, princess, knight), quests, pirates, and legendary items (wand, potion, treasure).",
    emoji: "🏰",
  },
  sight: {
    id: "sight",
    name: "Sight Word School",
    tagline: "Common words for faster reading",
    description:
      "High-frequency sight words and heart words — the building blocks of early reading (the, you, said, because). These don't fit a theme; they're taught for recognition.",
    emoji: "📚",
  },
  feelings: {
    id: "feelings",
    name: "Feelings Forest",
    tagline: "Emotions, feelings & how we act",
    description:
      "Emotions, character traits, and virtues — happy, scared, kind, brave, proud, fair. Words that name what's going on inside or describe how someone acts.",
    emoji: "💗",
  },
};

// Inverse of worldForCategory — used to group/filter categories by world.
// Keep in sync with the switch statement below.
export const CATEGORIES_BY_WORLD: Record<WorldId, string[]> = {
  sight:    ["sight_words", "heart_words"],
  animals:  ["animals"],
  food:     ["food"],
  nature:   ["nature"],
  space:    ["space"],
  objects:  ["objects"],
  magic:    ["magic", "adventure"],
  feelings: ["feelings", "concepts"],
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
      return { world: WORLDS.animals, ambiguous: false };
    case "food":
      return { world: WORLDS.food, ambiguous: false };
    case "nature":
      return { world: WORLDS.nature, ambiguous: false };
    case "space":
      return { world: WORLDS.space, ambiguous: false };
    case "objects":
      return { world: WORLDS.objects, ambiguous: false };
    case "feelings":
    case "concepts":
      return { world: WORLDS.feelings, ambiguous: false };
    case "magic":
    case "adventure":
      return { world: WORLDS.magic, ambiguous: false };
    default:
      return {
        world: null,
        ambiguous: true,
        note: "Unknown category — the game will fall back to Animal Kingdom. Re-categorize for correct world placement.",
      };
  }
}
