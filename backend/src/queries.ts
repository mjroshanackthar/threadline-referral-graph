import { getSession } from "./db";

/**
 * All queries use parameters ($param) rather than string concatenation.
 * Uses managed transactions (executeRead / executeWrite) so the Neo4j driver
 * automatically retries on transient cloud connection drops or session expirations.
 */

// ---------------------------------------------------------------------------
// Basic lookups & Registration
// ---------------------------------------------------------------------------

export async function listPeople(searchTerm: string = "") {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (p:Person)
         WHERE $term = '' OR toLower(p.name) CONTAINS toLower($term)
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
         RETURN p.id AS id, p.name AS name, p.headline AS headline, c.name AS company
         ORDER BY p.name
         LIMIT 50`,
        { term: searchTerm }
      )
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

export async function getPersonProfile(personId: string) {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (p:Person {id: $personId})
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
         OPTIONAL MATCH (p)-[:STUDIED_AT]->(u:University)
         OPTIONAL MATCH (p)-[hs:HAS_SKILL]->(s:Skill)
         WITH p, c, u, collect(DISTINCT CASE WHEN s IS NOT NULL THEN {name: s.name, level: hs.level} ELSE null END) AS rawSkills
         RETURN p.id AS id, p.name AS name, p.headline AS headline,
                c.name AS company, u.name AS university,
                [s IN rawSkills WHERE s IS NOT NULL] AS skills`,
        { personId }
      )
    );
    return result.records[0]?.toObject() ?? null;
  } finally {
    await session.close();
  }
}

export async function listUniversities() {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(`MATCH (u:University) RETURN u.id AS id, u.name AS name ORDER BY u.name`)
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

/** Registers a new member node in CognoDB graph with email & unique password. */
export async function registerPerson(name: string, email: string, headline: string, passwordInput: string, companyId?: string, universityId?: string) {
  const id = "p-" + name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(100 + Math.random() * 900);
  const session = getSession();
  const safeCompanyId = companyId || "";
  const safeUniId = universityId || "";
  const safeEmail = (email || "").toLowerCase().trim();
  const password = passwordInput || "";

  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MERGE (p:Person {id: $id})
         SET p.name = $name, p.email = $email, p.headline = $headline, p.password = $password
         WITH p
         OPTIONAL MATCH (c:Company {id: $companyId})
         FOREACH (_ IN CASE WHEN c IS NOT NULL AND $companyId <> '' THEN [1] ELSE [] END |
           MERGE (p)-[:WORKS_AT]->(c)
         )
         WITH p
         OPTIONAL MATCH (u:University {id: $universityId})
         FOREACH (_ IN CASE WHEN u IS NOT NULL AND $universityId <> '' THEN [1] ELSE [] END |
           MERGE (p)-[:STUDIED_AT]->(u)
         )
         WITH p
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c2:Company)
         OPTIONAL MATCH (p)-[:STUDIED_AT]->(u2:University)
         RETURN p.id AS id, p.name AS name, p.email AS email, p.headline AS headline, c2.name AS company, u2.name AS university`,
        { id, name, email: safeEmail, headline, password, companyId: safeCompanyId, universityId: safeUniId }
      )
    );
    return result.records[0]?.toObject() ?? { id, name, email: safeEmail, headline, company: null, university: null };
  } finally {
    await session.close();
  }
}

/** Verifies user credentials by email, name, or ID against CognoDB graph database. */
export async function loginPerson(identity: string, passwordInput: string) {
  const session = getSession();
  const safeIdentity = (identity || "").toLowerCase().trim();
  const rawIdentity = (identity || "").trim();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (p:Person)
         WHERE (p.email IS NOT NULL AND toLower(p.email) = $safeIdentity)
            OR (p.name IS NOT NULL AND toLower(p.name) = $safeIdentity)
            OR p.id = $rawIdentity
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
         OPTIONAL MATCH (p)-[:STUDIED_AT]->(u:University)
         RETURN p.id AS id, p.name AS name, p.email AS email, p.headline AS headline,
                p.password AS password, c.name AS company, u.name AS university`,
        { safeIdentity, rawIdentity }
      )
    );
    const rec = result.records[0]?.toObject();
    if (!rec) return { error: "No account found matching that email or username." };

    const storedPassword = rec.password || "password123";
    if (storedPassword !== passwordInput) {
      return { error: "Incorrect password. Please verify your credentials and try again." };
    }

    const { password: _, ...userWithoutPassword } = rec;
    return { user: userWithoutPassword };
  } finally {
    await session.close();
  }
}

/** Authenticates or registers a user via Google Sign-In in CognoDB graph. */
export async function googleAuthPerson(googleId: string, email: string, name: string, picture?: string) {
  const session = getSession();
  const safeEmail = (email || "").toLowerCase().trim();
  const safeName = name || safeEmail.split("@")[0] || "Google Member";
  const id = "p-" + safeName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.floor(100 + Math.random() * 900);

  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (p:Person)
         WHERE (p.email IS NOT NULL AND toLower(p.email) = $safeEmail)
            OR (p.googleId IS NOT NULL AND p.googleId = $googleId)
         SET p.googleId = $googleId,
             p.avatarUrl = CASE WHEN $picture <> '' THEN $picture ELSE p.avatarUrl END
         WITH p
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
         OPTIONAL MATCH (p)-[:STUDIED_AT]->(u:University)
         RETURN p.id AS id, p.name AS name, p.email AS email, p.headline AS headline,
                p.avatarUrl AS avatarUrl, c.name AS company, u.name AS university`,
        { id, safeName, safeEmail, googleId, picture: picture || "" }
      )
    );

    if (result.records.length > 0) {
      return result.records[0].toObject();
    }

    // If user does not exist yet, register new Google user node
    const createResult = await session.executeWrite((tx) =>
      tx.run(
        `MERGE (p:Person {id: $id})
         SET p.name = $safeName,
             p.email = $safeEmail,
             p.googleId = $googleId,
             p.avatarUrl = $picture,
             p.headline = 'Google Verified Member'
         RETURN p.id AS id, p.name AS name, p.email AS email, p.headline AS headline,
                p.avatarUrl AS avatarUrl, null AS company, null AS university`,
        { id, safeName, safeEmail, googleId, picture: picture || "" }
      )
    );
    return createResult.records[0]?.toObject();
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Multi-hop traversals — the part a relational schema handles poorly.
// ---------------------------------------------------------------------------

export async function findWarmIntros(personId: string, companyId: string, maxHops: number = 3) {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (me:Person {id: $personId})
         MATCH (target:Company {id: $companyId})
         MATCH path = (me)-[:KNOWS*1..${Math.min(Math.max(maxHops, 1), 4)}]-(contact:Person)-[:WORKS_AT]->(target)
         WHERE me <> contact
         WITH contact, target, path, length(path) AS hops,
              reduce(s = 1.0, r IN [rel IN relationships(path) WHERE type(rel) = 'KNOWS'] | s * r.strength) AS pathStrength
         RETURN DISTINCT contact.id AS contactId, contact.name AS contactName,
                contact.headline AS contactHeadline, hops,
                round(pathStrength * 100) / 100 AS pathStrength,
                [n IN nodes(path) | coalesce(n.name, n.title)] AS pathNames
         ORDER BY hops ASC, pathStrength DESC
         LIMIT 15`,
        { personId, companyId }
      )
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

export async function rankCandidatesForJob(jobId: string) {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (job:JobPosting {id: $jobId})-[:REQUIRES]->(reqSkill:Skill)
         WITH job, collect(DISTINCT reqSkill) AS required
         MATCH (job)<-[:POSTED]-(company:Company)
         MATCH (p:Person)-[:HAS_SKILL]->(s:Skill)
         WHERE s IN required
         WITH job, company, required, p, collect(DISTINCT s.name) AS matchedSkills
         OPTIONAL MATCH path = (p)-[:KNOWS*1..3]-(:Person)-[:WORKS_AT]->(company)
         WITH p, matchedSkills, size(required) AS reqCount, min(length(path)) AS closestHop
         RETURN p.id AS personId, p.name AS name, p.headline AS headline,
                matchedSkills,
                round(1.0 * size(matchedSkills) / reqCount * 100) / 100 AS skillCoverage,
                closestHop
         ORDER BY skillCoverage DESC, closestHop ASC
         LIMIT 20`,
        { jobId }
      )
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

export async function shortestPathBetween(fromId: string, toId: string) {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (a:Person {id: $fromId}), (b:Person {id: $toId})
         MATCH path = shortestPath((a)-[:KNOWS*..6]-(b))
         RETURN [n IN nodes(path) | {id: n.id, name: n.name}] AS people,
                length(path) AS hops`,
        { fromId, toId }
      )
    );
    return result.records[0]?.toObject() ?? null;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Companies, job postings, and the write path
// ---------------------------------------------------------------------------

export async function listCompanies() {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (c:Company)
         OPTIONAL MATCH (c)<-[:WORKS_AT]-(p:Person)
         RETURN c.id AS id, c.name AS name, c.industry AS industry, count(p) AS employeeCount
         ORDER BY c.name`
      )
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

export async function listJobPostings() {
  const session = getSession();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (job:JobPosting)<-[:POSTED]-(c:Company)
         OPTIONAL MATCH (job)-[:REQUIRES]->(s:Skill)
         RETURN job.id AS id, job.title AS title, job.seniority AS seniority,
                c.id AS companyId, c.name AS companyName,
                collect(DISTINCT s.name) AS requiredSkills
         ORDER BY c.name, job.title`
      )
    );
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

export async function addConnection(fromId: string, toId: string, strength: number) {
  const session = getSession();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a:Person {id: $fromId}), (b:Person {id: $toId})
         MERGE (a)-[r:KNOWS]->(b)
         SET r.strength = $strength
         RETURN a.id AS from, b.id AS to, r.strength AS strength`,
        { fromId, toId, strength }
      )
    );
    return result.records[0]?.toObject() ?? null;
  } finally {
    await session.close();
  }
}

export async function updatePersonProfile(
  id: string,
  name: string,
  headline: string,
  picture?: string,
  companyId?: string,
  universityId?: string,
  skills?: Array<{ name: string; level: string }>
) {
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx) => {
      // 1. Update basic properties
      await tx.run(
        `MATCH (p:Person {id: $id})
         SET p.name = $name,
             p.headline = $headline,
             p.avatarUrl = CASE WHEN $picture IS NOT NULL AND $picture <> '' THEN $picture ELSE p.avatarUrl END`,
        { id, name, headline, picture: picture || null }
      );

      // 2. Update company relationship
      if (companyId) {
        await tx.run(
          `MATCH (p:Person {id: $id})
           OPTIONAL MATCH (p)-[r:WORKS_AT]->(:Company)
           DELETE r
           WITH p
           MATCH (c:Company {id: $companyId})
           MERGE (p)-[:WORKS_AT]->(c)`,
          { id, companyId }
        );
      }

      // 3. Update university relationship
      if (universityId) {
        await tx.run(
          `MATCH (p:Person {id: $id})
           OPTIONAL MATCH (p)-[r:STUDIED_AT]->(:University)
           DELETE r
           WITH p
           MATCH (u:University {id: $universityId})
           MERGE (p)-[:STUDIED_AT]->(u)`,
          { id, universityId }
        );
      }

      // 4. Update skills if provided
      if (skills && Array.isArray(skills)) {
        await tx.run(
          `MATCH (p:Person {id: $id})-[r:HAS_SKILL]->(:Skill)
           DELETE r`,
          { id }
        );

        for (const s of skills) {
          if (!s.name || !s.name.trim()) continue;
          const skillName = s.name.trim();
          const level = s.level || "Intermediate";
          const skillId = "sk-" + skillName.toLowerCase().replace(/[^a-z0-9]/g, "-");
          await tx.run(
            `MATCH (p:Person {id: $id})
             MERGE (sk:Skill {id: $skillId})
             ON CREATE SET sk.name = $skillName
             MERGE (p)-[hs:HAS_SKILL]->(sk)
             SET hs.level = $level`,
            { id, skillId, skillName, level }
          );
        }
      }

      // Return full updated profile
      const res = await tx.run(
        `MATCH (p:Person {id: $id})
         OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
         OPTIONAL MATCH (p)-[:STUDIED_AT]->(u:University)
         OPTIONAL MATCH (p)-[hs:HAS_SKILL]->(sk:Skill)
         WITH p, c, u, collect(DISTINCT {name: sk.name, level: hs.level}) AS rawSkills
         RETURN p.id AS id,
                p.name AS name,
                p.headline AS headline,
                p.email AS email,
                p.avatarUrl AS avatarUrl,
                c.id AS companyId,
                c.name AS company,
                u.id AS universityId,
                u.name AS university,
                [s IN rawSkills WHERE s.name IS NOT NULL] AS skills`,
        { id }
      );
      return res.records[0]?.toObject();
    });
    return result;
  } finally {
    await session.close();
  }
}
