/**
 * Import-graph rules (architecture.md, "Enforcing the direction"). ESLint's no-restricted-imports
 * already enforces the layer order; this covers what a per-file import rule cannot see: cycles,
 * modules nothing imports, and presentation code reaching past its layer.
 * Run: npm run deps   (part of `npm run check`)
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "No circular dependencies, in any language.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-and-lib-are-pure",
      comment: "Domain rules and lib helpers import no framework, no database and no browser or Node API.",
      severity: "error",
      from: { path: "^src/(domain|lib)/", pathNot: "\\.test\\.ts$" },
      to: { path: "^node_modules/(next|react|react-dom|@supabase|server-only)/" },
    },
    {
      name: "domain-and-lib-use-no-node-builtins",
      comment: "Domain and lib run in the browser too: no Node core modules.",
      severity: "error",
      from: { path: "^src/(domain|lib)/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "components-do-not-touch-data",
      comment: "Components and ui call actions and receive props. They never import the data layer.",
      severity: "error",
      from: { path: "^src/(ui|features/[^/]+/components)/" },
      to: { path: "^src/data/" },
    },
    {
      name: "not-to-test-files",
      comment: "Production code does not import test code or fixtures.",
      severity: "error",
      from: { pathNot: "\\.test\\.[mc]?[jt]sx?$|^src/domain/fixtures\\.ts$" },
      to: { path: "\\.test\\.[mc]?[jt]sx?$|^src/domain/fixtures\\.ts$" },
    },
    {
      name: "no-orphans",
      comment: "A module nothing imports is dead code (deprecation.md): delete it with the change that orphaned it.",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "\\.test\\.[mc]?[jt]sx?$",
          "^src/app/", // Next.js routes, layouts and special files are entry points
          "^src/proxy\\.ts$",
          "^src/data/database\\.types\\.ts$", // generated
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    exclude: { path: "^src/generated/" },
  },
};
