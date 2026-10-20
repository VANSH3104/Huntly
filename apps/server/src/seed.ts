import { getDatabase, runMigrations } from "@huntly/database";

/**
 * Seed script — sets up schema without hardcoding companies.
 * Companies and jobs are discovered live via real public searches and LinkedIn.
 */
export async function seedDemoData() {
  await runMigrations();
  console.log("✓ Database migrations complete (no hardcoded companies). Real jobs are discovered dynamically.");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
