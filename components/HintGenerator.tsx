"use client";

import { useState } from "react";
import type { GeneratedHints, Word } from "@/lib/types";

interface HintGeneratorProps {
  word: Word;
  onSave: (hints: GeneratedHints) => void;
}

export default function HintGenerator({ word, onSave }: HintGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHints, setGeneratedHints] = useState<GeneratedHints | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.word,
          category: word.category,
          ageGroup: word.age_group,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate hints");
      }

      const hints = (await response.json()) as GeneratedHints;
      setGeneratedHints(hints);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate hints");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (generatedHints) {
      onSave(generatedHints);
      setGeneratedHints(null);
    }
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-4">AI Hint Generator</h3>

      {!generatedHints ? (
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Generate age-appropriate hints, definition, and example sentence for this
            word using AI.
          </p>

          {error && (
            <div className="bg-[var(--error-bg)] text-[var(--error)] px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn btn-primary w-full"
          >
            {isGenerating ? (
              <>
                <span className="spinner" />
                Generating...
              </>
            ) : (
              "Generate Hints"
            )}
          </button>
        </div>
      ) : (
        <div>
          <div className="space-y-4 mb-6">
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Easy Hint
              </h4>
              <p className="text-[var(--text-primary)]">{generatedHints.hints.easy}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Medium Hint
              </h4>
              <p className="text-[var(--text-primary)]">{generatedHints.hints.medium}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Hard Hint
              </h4>
              <p className="text-[var(--text-primary)]">{generatedHints.hints.hard}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Definition
              </h4>
              <p className="text-[var(--text-primary)]">{generatedHints.definition}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Example Sentence
              </h4>
              <p className="text-[var(--text-primary)] italic">
                &ldquo;{generatedHints.example_sentence}&rdquo;
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                Part of Speech
              </h4>
              <p className="text-[var(--text-primary)]">{generatedHints.part_of_speech}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} className="btn btn-success flex-1">
              Save Hints
            </button>
            <button onClick={handleGenerate} className="btn btn-secondary flex-1">
              Regenerate
            </button>
            <button
              onClick={() => setGeneratedHints(null)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
