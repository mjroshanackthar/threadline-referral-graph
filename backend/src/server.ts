import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { verifyConnectivity, closeDriver } from "./db";
import * as q from "./queries";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static assets for unified hosting
const frontendDir = path.join(__dirname, "../../frontend");
app.use(express.static(frontendDir));

let dbAvailable = false;

// Wrap every handler so a Neo4j/driver error becomes a clean JSON 503
// instead of an unhandled rejection or a raw stack trace to the client.
function safe(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    if (!dbAvailable) {
      res.status(503).json({
        error: "Database unavailable",
        message: "Cannot reach CognoDB right now. Check your connection details and try again.",
      });
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[api] ${req.method} ${req.path} failed:`, (err as Error).message);
      res.status(502).json({ error: "Query failed", message: (err as Error).message });
    }
  };
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", database: dbAvailable ? "connected" : "unavailable" });
});

app.get(
  "/api/people",
  safe(async (req, res) => {
    const term = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await q.listPeople(term));
  })
);

app.get(
  "/api/people/:id",
  safe(async (req, res) => {
    const profile = await q.getPersonProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(profile);
  })
);

app.get(
  "/api/companies",
  safe(async (_req, res) => {
    res.json(await q.listCompanies());
  })
);

app.get(
  "/api/jobs",
  safe(async (_req, res) => {
    res.json(await q.listJobPostings());
  })
);

app.get(
  "/api/jobs/:id/candidates",
  safe(async (req, res) => {
    res.json(await q.rankCandidatesForJob(req.params.id));
  })
);

app.get(
  "/api/intros",
  safe(async (req, res) => {
    const { personId, companyId } = req.query as Record<string, string>;
    if (!personId || !companyId) {
      res.status(400).json({ error: "personId and companyId are required" });
      return;
    }
    res.json(await q.findWarmIntros(personId, companyId));
  })
);

app.get(
  "/api/path",
  safe(async (req, res) => {
    const { fromId, toId } = req.query as Record<string, string>;
    if (!fromId || !toId) {
      res.status(400).json({ error: "fromId and toId are required" });
      return;
    }
    const path = await q.shortestPathBetween(fromId, toId);
    if (!path) {
      res.status(404).json({ error: "No path found within 6 hops" });
      return;
    }
    res.json(path);
  })
);

app.post(
  "/api/connections",
  safe(async (req, res) => {
    const { fromId, toId, strength } = req.body as {
      fromId: string;
      toId: string;
      strength: number;
    };
    res.json(await q.addConnection(fromId, toId, strength ?? 0.5));
  })
);

app.get(
  "/api/universities",
  safe(async (_req, res) => {
    res.json(await q.listUniversities());
  })
);

app.post(
  "/api/auth/login",
  safe(async (req, res) => {
    const { identity, password } = req.body as { identity: string; password: string };
    if (!identity || !password) {
      res.status(400).json({ error: "Identity and Password are required" });
      return;
    }
    const result = await q.loginPerson(identity, password);
    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json(result.user);
  })
);

app.post(
  "/api/auth/register",
  safe(async (req, res) => {
    const { name, email, headline, password, companyId, universityId } = req.body as {
      name: string;
      email?: string;
      headline: string;
      password: string;
      companyId?: string;
      universityId?: string;
    };
    if (!name || !password) {
      res.status(400).json({ error: "Full Name and Password are required" });
      return;
    }
    const person = await q.registerPerson(name, email || "", headline || "Network Member", password, companyId, universityId);
    res.json(person);
  })
);

app.post(
  "/api/auth/google",
  safe(async (req, res) => {
    const { googleId, email, name, picture } = req.body as {
      googleId: string;
      email: string;
      name: string;
      picture?: string;
    };
    if (!email) {
      res.status(400).json({ error: "Google email address is required" });
      return;
    }
    const safeGoogleId = googleId || "gid-" + Math.floor(100000 + Math.random() * 900000);
    const user = await q.googleAuthPerson(safeGoogleId, email, name, picture);
    res.json(user);
  })
);

app.get(
  "/api/skills",
  safe(async (_req, res) => {
    res.json(await q.listSkills());
  })
);

app.post(
  "/api/people/:id/update",
  safe(async (req, res) => {
    const { name, headline, companyId, universityId, skills } = req.body as {
      name: string;
      headline: string;
      companyId: string | null;
      universityId: string | null;
      skills: { id: string; level: string }[];
    };
    if (!name) {
      res.status(400).json({ error: "Full Name is required" });
      return;
    }
    const updated = await q.updatePersonProfile(
      req.params.id,
      name,
      headline,
      companyId,
      universityId,
      skills
    );
    res.json(updated);
  })
);

// Fallback error handler for anything that slips past `safe`.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// SPA fallback for hosted deployment
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDir, "index.html"));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function start() {
  dbAvailable = await verifyConnectivity();
  if (!dbAvailable) {
    console.warn(
      "[api] Starting anyway with the database marked unavailable — " +
        "every /api/* route will return 503 until CognoDB is reachable."
    );
  }
  app.listen(PORT, () => {
    console.log(`[api] Listening on port ${PORT} (db: ${dbAvailable ? "up" : "down"})`);
  });
}

start();

process.on("SIGINT", async () => {
  await closeDriver();
  process.exit(0);
});
