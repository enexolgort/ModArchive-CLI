import * as cheerio from "cheerio";
import * as http from "http";
import * as https from "https";
import {
  insertArtist,
  updateArtistStats,
  insertModule,
  updateModule,
  insertGenre,
  getGenreByName,
  insertModuleGenre,
  countModulesForArtist,
} from "./db";

const BASE = "http://modarchive.org/index.php";
const DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<string> {
  try {
    return await fetchPage(url);
  } catch (err: any) {
    if (
      retries > 0 &&
      ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(err?.code)
    ) {
      console.log(
        `  [Retry] ${err.code} — waiting ${RETRY_DELAY_MS / 1000}s before retry (${retries} left)...`,
      );
      await sleep(RETRY_DELAY_MS);
      return fetchWithRetry(url, retries - 1);
    }
    throw err;
  }
}

function fetchPage(url: string, baseUrl?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      { headers: { "User-Agent": "ModArchiveScraper/1.0" } },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          const location = res.headers.location;
          // Resolve relative redirects against the original URL
          const redirectUrl = location.startsWith("http")
            ? location
            : new URL(location, url).href;
          fetchPage(redirectUrl).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      },
    );
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

// --- ROSTER ---

export async function scrapRoster() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  // const letters = "H".split("");

  for (const letter of letters) {
    console.log(`\n[Roster] Letter: ${letter}`);
    let page = 1;

    while (true) {
      const url = `${BASE}?request=view_artist_roster&query=${letter}&page=${page}#mods`;
      console.log(`  Page ${page}: ${url}`);

      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const links = $("a.search-result-link");

      if (links.length === 0 || page == 2) {
        console.log(
          `  No more artists on page ${page}, moving to next letter.`,
        );
        break;
      }

      links.each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const match = href.match(/member\.php\?(.+)/);
        const artistId = match ? match[1] : null;
        const artistName = $(el).text().trim();

        if (artistId && artistName) {
          insertArtist.run(artistId, artistName);
        }
      });

      console.log(`  Saved ${links.length} artists.`);
      page++;
      await sleep(DELAY_MS);
    }
  }
}

// --- ARTIST STATS ---

interface ArtistStats {
  moduleCount: number | null;
  rating: number | null;
  ratingCount: number | null;
}

async function scrapArtistStats(artistId: string): Promise<ArtistStats> {
  const url = `http://modarchive.org/member.php?${artistId}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  let moduleCount: number | null = null;
  let rating: number | null = null;
  let ratingCount: number | null = null;

  $("li.stats").each((_, el) => {
    const text = $(el).text().trim();

    // Module count: contains a link to modules.php
    const moduleLink = $(el).find("a[href^='modules.php?']");
    if (moduleLink.length > 0) {
      const val = parseInt(moduleLink.text().trim(), 10);
      if (!isNaN(val)) moduleCount = val;
    }

    // Rating: "Overall Member Rating: 6.5 (from 20 comments)."
    const ratingMatch = text.match(
      /Overall Member Rating:\s*([\d.]+)\s*\(from\s*(\d+)\s*comments?\)/i,
    );
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1]);
      ratingCount = parseInt(ratingMatch[2], 10);
    }
  });

  return { moduleCount, rating, ratingCount };
}

// --- ARTIST MODULES ---

export async function scrapArtistModules(artistId: string, artistName: string) {
  const {
    moduleCount: liveCount,
    rating,
    ratingCount,
  } = await scrapArtistStats(artistId);
  await sleep(DELAY_MS);

  if (liveCount !== null) {
    updateArtistStats.run(liveCount, rating, ratingCount, artistId);

    const { count: dbCount } = countModulesForArtist.get(artistId) as {
      count: number;
    };

    if (dbCount >= liveCount) {
      console.log(
        `  [Skip] ${artistName}: DB has ${dbCount}/${liveCount} modules, up to date.`,
      );
      return;
    }

    console.log(
      `  [Scrap] ${artistName}: DB has ${dbCount}/${liveCount} modules, rating: ${rating ?? "N/A"} (${ratingCount ?? 0} comments)`,
    );
  }

  let page = 1;

  while (true) {
    const url = `${BASE}?request=view_artist_modules&query=${artistId}&page=${page}#mods`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const links = $("a.module-listing");

    links.each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/module\.php\?(.+)/);
      const moduleId = match ? match[1] : null;
      const fileName = $(el).attr("title")?.trim() ?? $(el).text().trim();

      if (moduleId && fileName) {
        insertModule.run(moduleId, artistId, fileName);
      }
    });

    // Check if a "next page" pagination link exists
    const hasNextPage = $(`a.pagination[href*="page=${page + 1}"]`).length > 0;
    if (!hasNextPage) break;

    page++;
    await sleep(DELAY_MS);
  }
}

export async function scrapModule(moduleId: string) {
  const url = `${BASE}?request=view_by_moduleid&query=${moduleId}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const h1 = $("h1").first();
  h1.find("span").remove();
  const moduleName = h1.text().trim();

  let md5 = "";
  const genres: string[] = [];

  $("li.stats").each((_, el) => {
    const text = $(el).text().trim();

    if (text.startsWith("MD5:")) {
      md5 = text.replace("MD5:", "").trim();
    } else if (text.startsWith("Genre:")) {
      const parsed = text
        .replace("Genre:", "")
        .replace(/\([^)]*\)/g, "")
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean);
      genres.push(...parsed);
    }
  });

  updateModule.run(moduleName || null, md5 || null, moduleId);

  for (const genreName of genres) {
    insertGenre.run(genreName);
    const row = getGenreByName.get(genreName) as { id: number } | undefined;
    if (row) {
      insertModuleGenre.run(moduleId, row.id);
    }
  }
}
