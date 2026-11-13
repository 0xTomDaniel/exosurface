import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // The project service only finds files named tsconfig.json. These a2ui spike files belong only to its second
    // program (split to stay under the gate heap), so they use that program with the same strict settings. A new file
    // outside both programs is a fatal ESLint result, which scripts/lint.ts refuses as unanswered.
    files: [
      "plugins/bb-plugin-exo-a2ui-spike/composition/tool-schema.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/document-planner.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/document-turn.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/document.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/mode.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/planner.ts",
      "plugins/bb-plugin-exo-a2ui-spike/observer/stream.ts",
    ],
    languageOptions: {
      parserOptions: { projectService: false, project: ["./plugins/bb-plugin-exo-a2ui-spike/tsconfig.composition.json"], tsconfigRootDir: import.meta.dirname },
    },
  },
);
