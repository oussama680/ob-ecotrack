import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const envPath = path.join(
  projectRoot,
  ".env"
);

const envResult = dotenv.config({
  path: envPath,
});

if (envResult.error) {
  console.error(
    "[Samex Auto Sync] Could not load .env:",
    envResult.error.message
  );

  process.exit(1);
}

if (!process.env.SHOPIFY_APP_URL) {
  console.error(
    "[Samex Auto Sync] SHOPIFY_APP_URL is missing from .env"
  );

  process.exit(1);
}

if (!process.env.SHOPIFY_SHOP) {
  console.error(
    "[Samex Auto Sync] SHOPIFY_SHOP is missing from .env"
  );

  process.exit(1);
}

if (!process.env.SAMEX_TOKEN) {
  console.error(
    "[Samex Auto Sync] SAMEX_TOKEN is missing from .env"
  );

  process.exit(1);
}

console.log(
  `[Samex Auto Sync] Environment loaded from ${envPath}`
);

console.log(
  `[Samex Auto Sync] Shop: ${process.env.SHOPIFY_SHOP}`
);

const {
  syncSamexForShop,
} = await import(
  "../app/jobs/samex-sync.server.js"
);

async function main() {
  if (
    String(
      process.env.SAMEX_AUTO_SYNC
    ).toLowerCase() !== "true"
  ) {
    console.log(
      "[Samex Auto Sync] SAMEX_AUTO_SYNC is disabled."
    );

    return;
  }

  console.log(
    `[Samex Auto Sync] Starting for ${process.env.SHOPIFY_SHOP}`
  );

  try {
    const result =
      await syncSamexForShop();

    console.log(
      JSON.stringify(
        result.summary,
        null,
        2
      )
    );

    for (
      const item of
      result.results.updated
    ) {
      console.log(
        `[UPDATED] ${item.orderName} -> ${item.status} -> ${item.trackingNumber}`
      );
    }

    for (
      const item of
      result.results.notFound
    ) {
      console.log(
        `[NOT FOUND] ${item.orderName} -> ${item.oldTracking}`
      );
    }

    for (
      const item of
      result.results.failed
    ) {
      console.error(
        `[FAILED] ${item.orderName} -> ${item.reason}`
      );
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      "[Samex Auto Sync ERROR]",
      error
    );

    process.exitCode = 1;
  }
}

await main();