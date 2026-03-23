/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@orchentra/eslint-config/library.js"],
  rules: {
    "turbo/no-undeclared-env-vars": ["error", {
      allowList: ["ANTHROPIC_API_KEY", "ORCHENTRA_CONFIG", "SERVER_URL"],
    }],
  },
};
