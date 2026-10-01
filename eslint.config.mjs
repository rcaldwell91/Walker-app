import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Nobody should ever see the browser's "Please match the requested format".
    // Forms check on the server and show one plain line (see src/lib/input.ts).
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='form']:not(:has(JSXAttribute[name.name='noValidate']))",
          message: "Add noValidate: check input on the server and show a plain line, never the browser's message.",
        },
        {
          selector: "JSXAttribute[name.name='pattern']",
          message: "No browser pattern checks. Tidy the input on the server (src/lib/input.ts).",
        },
      ],
    },
  },
];

export default eslintConfig;
