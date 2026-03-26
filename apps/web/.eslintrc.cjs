/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@orchentra/eslint-config/next.js"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
  },
};