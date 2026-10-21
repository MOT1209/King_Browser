import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Run with: npm run lint
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-test/**",
      "dist-electron/**",
      "build/**",
      "public/**",
      "website/**",
      "video/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      // أسلوب لا خطأ سلوكي: تحذيرات تُخفَّض تدريجياً بدل إيقاف الفحص
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // سكربتات CJS ومحاكيات الاختبار تستخدم require وFunction عمداً
    files: ["scripts/**", "tests/**", "electron/**", "*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
];
