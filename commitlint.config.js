// Commit messages and PR titles follow Conventional Commits: `type(scope): what changed`, e.g.
//   feat(world): any number of stops        fix(people): walk cycle by distance
//   perf: lamps without lights               docs: how to run the checks
// Types: feat, fix, perf, refactor, test, docs, style, build, ci, chore, revert.
// Checked by the commit-msg hook (.githooks/) and in CI for every commit and the PR title — a PR is
// squash-merged under its title, so the title is what ends up in main's history. English only.
// Messages are in English: no Vietnamese letters in the header or the body.
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const english = (text) => [!VIETNAMESE.test(text ?? ''), 'write the commit message in English (no Vietnamese letters)'];

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'header-english': ({ header }) => english(header), 'body-english': ({ body }) => english(body) } }],
  rules: {
    'header-english': [2, 'always'],
    'body-english': [2, 'always'],
    'subject-case': [0], // names like `npm run check`, JSDoc, PYN keep their case
    'body-max-line-length': [1, 'always', 100], // warn only: URLs and tables may be longer
  },
};
