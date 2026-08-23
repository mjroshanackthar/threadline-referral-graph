import neo4j, { Driver, Session } from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const URI = process.env.COGNODB_URI;
const USER = process.env.COGNODB_USER || "cognodb";
const PASSWORD = process.env.COGNODB_PASSWORD;

if (!URI || !PASSWORD) {
  console.error(
    "[db] Missing COGNODB_URI or COGNODB_PASSWORD environment variables. " +
      "Copy .env.example to .env and fill in your CognoDB Cloud connection details."
  );
}

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;
  if (!URI || !PASSWORD) {
    throw new Error("Database is not configured (missing environment variables).");
  }
  driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
    maxConnectionPoolSize: 1,       // Single connection queue prevents socket contention on CognoDB Cloud
    maxConnectionLifetime: 60000,   // Recycle idle sockets after 60s
    connectionTimeout: 10000,       // Connection establishment timeout
    disableLosslessIntegers: true,
  });
  return driver;
}

export async function verifyConnectivity(): Promise<boolean> {
  try {
    const d = getDriver();
    await d.verifyConnectivity();
    console.log("[db] Connected to CognoDB successfully.");
    return true;
  } catch (err) {
    console.error("[db] Could not connect to CognoDB:", (err as Error).message);
    return false;
  }
}

export function getSession(): Session {
  return getDriver().session();
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    try {
      await driver.close();
    } catch {}
    driver = null;
  }
}
