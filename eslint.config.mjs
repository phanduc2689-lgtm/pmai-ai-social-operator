import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["node_modules/**", "apps/desktop/dist-main/**", "apps/desktop/dist-renderer/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
