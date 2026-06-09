import db from "./db";
import { scrapRoster, scrapArtistModules, scrapModule } from "./scraper";

const PURGE = false;
const mode = process.argv[2] ?? "all";

async function scrapArtists() {
  console.log("=== Step 1: Scraping artist roster ===");
  await scrapRoster();

  console.log("\n=== Step 2: Scraping artist modules ===");
  const artists = db.prepare("SELECT DISTINCT id, name FROM artists").all() as {
    id: string;
    name: string;
  }[];

  const total = artists.length;
  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    console.log(`[${i + 1}/${total}] Artist: ${artist.name} (${artist.id})`);
    await scrapArtistModules(artist.id, artist.name);
  }
}

async function scrapModuleDetails() {
  console.log("=== Scraping module details ===");
  const modules = db
    .prepare(
      "SELECT id, file_name FROM modules WHERE module_name IS NULL OR md5 IS NULL",
    )
    .all() as { id: string; file_name: string }[];

  const total = modules.length;
  console.log(`Found ${total} modules to scrap.\n`);

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    console.log(`[${i + 1}/${total}] Module: ${mod.file_name} (${mod.id})`);
    await scrapModule(mod.id);
  }
}

async function main() {
  if (PURGE) {
    console.log("⚠️  Purging database...");
    db.exec(`
      DELETE FROM module_genres;
      DELETE FROM modules;
      DELETE FROM genres;
      DELETE FROM artists;
    `);
    console.log("✅ Database purged.\n");
  }

  if (mode === "artists") {
    await scrapArtists();
  } else if (mode === "modules") {
    await scrapModuleDetails();
  } else {
    await scrapArtists();
    await scrapModuleDetails();
  }

  console.log("\nDone!");
}

main().catch(console.error);
