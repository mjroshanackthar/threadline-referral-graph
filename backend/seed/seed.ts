import dotenv from "dotenv";
import { getSession, closeDriver, verifyConnectivity } from "../src/db";
import { universities, companies, skills, people, knows, jobPostings } from "./seedData";

dotenv.config();

async function run() {
  const ok = await verifyConnectivity();
  if (!ok) {
    console.error("Aborting seed: cannot reach CognoDB. Check your .env file.");
    process.exit(1);
  }

  const session = getSession();
  try {
    console.log("Clearing existing graph...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("Creating constraints...");
    for (const label of ["Person", "Company", "University", "Skill", "JobPosting"]) {
      await session.run(
        `CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`
      );
    }

    console.log(`Loading ${universities.length} universities...`);
    await session.run(
      `UNWIND $rows AS row CREATE (:University {id: row.id, name: row.name})`,
      { rows: universities }
    );

    console.log(`Loading ${companies.length} companies...`);
    await session.run(
      `UNWIND $rows AS row CREATE (:Company {id: row.id, name: row.name, industry: row.industry})`,
      { rows: companies }
    );

    console.log(`Loading ${skills.length} skills...`);
    await session.run(
      `UNWIND $rows AS row CREATE (:Skill {id: row.id, name: row.name})`,
      { rows: skills }
    );

    console.log(`Loading ${people.length} people...`);
    await session.run(
      `UNWIND $rows AS row
       CREATE (p:Person {id: row.id, name: row.name, headline: row.headline})
       WITH p, row
       OPTIONAL MATCH (u:University {id: row.university})
       FOREACH (_ IN CASE WHEN u IS NOT NULL THEN [1] ELSE [] END | MERGE (p)-[:STUDIED_AT]->(u))
       WITH p, row
       OPTIONAL MATCH (c:Company {id: row.company})
       FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END | MERGE (p)-[:WORKS_AT {role: row.role}]->(c))`,
      { rows: people.map((p) => ({ ...p, company: p.company || null })) }
    );

    console.log("Linking people to skills...");
    const skillRows = people.flatMap((p) =>
      p.skills.map(([skillId, level]) => ({ personId: p.id, skillId, level }))
    );
    await session.run(
      `UNWIND $rows AS row
       MATCH (p:Person {id: row.personId}), (s:Skill {id: row.skillId})
       MERGE (p)-[r:HAS_SKILL]->(s)
       SET r.level = row.level`,
      { rows: skillRows }
    );

    console.log(`Loading ${knows.length} KNOWS connections...`);
    await session.run(
      `UNWIND $rows AS row
       MATCH (a:Person {id: row.from}), (b:Person {id: row.to})
       MERGE (a)-[r:KNOWS]->(b)
       SET r.strength = row.strength`,
      { rows: knows.map(([from, to, strength]) => ({ from, to, strength })) }
    );

    console.log(`Loading ${jobPostings.length} job postings...`);
    await session.run(
      `UNWIND $rows AS row
       MATCH (c:Company {id: row.company})
       CREATE (job:JobPosting {id: row.id, title: row.title, seniority: row.seniority})
       MERGE (c)-[:POSTED]->(job)
       WITH job, row
       UNWIND row.requires AS skillId
       MATCH (s:Skill {id: skillId})
       MERGE (job)-[:REQUIRES]->(s)`,
      { rows: jobPostings }
    );

    console.log("Seed complete.");
  } finally {
    await session.close();
    await closeDriver();
  }
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
