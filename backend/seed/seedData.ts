// Realistic-shaped seed data for the Alumni & Referral Network graph.
// IDs are simple slugs so the demo data and API responses stay readable.

export const universities = [
  { id: "u-kalasalingam", name: "Kalasalingam Academy of Research and Education" },
  { id: "u-vit", name: "VIT Vellore" },
  { id: "u-anna", name: "Anna University" },
  { id: "u-nit-trichy", name: "NIT Tiruchirappalli" },
  { id: "u-iiit-h", name: "IIIT Hyderabad" },
];

export const companies = [
  { id: "c-ust", name: "UST", industry: "IT Services" },
  { id: "c-siemens", name: "Siemens Healthineers", industry: "MedTech" },
  { id: "c-infosys", name: "Infosys", industry: "IT Services" },
  { id: "c-deloitte", name: "Deloitte Digital", industry: "Consulting" },
  { id: "c-zoho", name: "Zoho Corporation", industry: "SaaS" },
  { id: "c-freshworks", name: "Freshworks", industry: "SaaS" },
];

export const skills = [
  { id: "s-react", name: "React.js" },
  { id: "s-node", name: "Node.js" },
  { id: "s-spring", name: "Spring Boot" },
  { id: "s-postgres", name: "PostgreSQL" },
  { id: "s-typescript", name: "TypeScript" },
  { id: "s-java", name: "Java" },
  { id: "s-solidity", name: "Solidity" },
  { id: "s-python", name: "Python" },
  { id: "s-dsa", name: "Data Structures & Algorithms" },
  { id: "s-as400", name: "AS400 / iSeries" },
  { id: "s-web3", name: "Web3.js" },
  { id: "s-testing", name: "Test Automation" },
];

// Each person: which university, which company + role, and skill levels.
export const people = [
  { id: "p-arjun", name: "Arjun Mehta", headline: "SDE-1", university: "u-kalasalingam", company: "c-ust", role: "Software Engineer", skills: [["s-java", "advanced"], ["s-as400", "intermediate"], ["s-postgres", "intermediate"]] },
  { id: "p-divya", name: "Divya Rao", headline: "Test Development Engineer", university: "u-kalasalingam", company: "c-ust", role: "Test Development Engineer", skills: [["s-testing", "advanced"], ["s-java", "intermediate"]] },
  { id: "p-karthik", name: "Karthik Subramanian", headline: "Software Trainee Engineer", university: "u-vit", company: "c-siemens", role: "Software Trainee Engineer", skills: [["s-python", "advanced"], ["s-postgres", "intermediate"]] },
  { id: "p-meena", name: "Meena Iyer", headline: "Full Stack Developer", university: "u-anna", company: "c-deloitte", role: "Full Stack Developer", skills: [["s-react", "advanced"], ["s-node", "advanced"], ["s-typescript", "intermediate"]] },
  { id: "p-rahul", name: "Rahul Nair", headline: "Backend Engineer", university: "u-nit-trichy", company: "c-zoho", role: "Backend Engineer", skills: [["s-java", "advanced"], ["s-spring", "advanced"], ["s-postgres", "advanced"]] },
  { id: "p-sneha", name: "Sneha Pillai", headline: "Product Engineer", university: "u-iiit-h", company: "c-freshworks", role: "Product Engineer", skills: [["s-react", "advanced"], ["s-typescript", "advanced"], ["s-node", "intermediate"]] },
  { id: "p-vikram", name: "Vikram Anand", headline: "Associate Consultant", university: "u-kalasalingam", company: "c-deloitte", role: "Associate Consultant", skills: [["s-react", "intermediate"], ["s-node", "intermediate"], ["s-spring", "beginner"]] },
  { id: "p-priya", name: "Priya Krishnan", headline: "Blockchain Developer", university: "u-vit", company: "c-zoho", role: "Blockchain Developer", skills: [["s-solidity", "advanced"], ["s-web3", "advanced"], ["s-java", "intermediate"]] },
  { id: "p-suresh", name: "Suresh Babu", headline: "New Associate", university: "u-anna", company: "c-infosys", role: "Web Developer New Associate", skills: [["s-java", "intermediate"], ["s-dsa", "intermediate"]] },
  { id: "p-ananya", name: "Ananya Das", headline: "Digital Specialist Engineer", university: "u-nit-trichy", company: "c-infosys", role: "Digital Specialist Engineer", skills: [["s-python", "advanced"], ["s-dsa", "advanced"], ["s-java", "intermediate"]] },
  { id: "p-farhan", name: "Farhan Sheikh", headline: "SDE-2", university: "u-iiit-h", company: "c-freshworks", role: "SDE-2", skills: [["s-node", "advanced"], ["s-typescript", "advanced"], ["s-postgres", "advanced"]] },
  { id: "p-lakshmi", name: "Lakshmi Narayanan", headline: "Software Engineer", university: "u-kalasalingam", company: "c-siemens", role: "Software Engineer", skills: [["s-python", "intermediate"], ["s-postgres", "intermediate"]] },
  { id: "p-rohit", name: "Rohit Verma", headline: "Executive - Full Stack", university: "u-vit", company: "c-deloitte", role: "Executive - Full Stack Development", skills: [["s-react", "advanced"], ["s-spring", "intermediate"], ["s-typescript", "intermediate"]] },
  { id: "p-swathi", name: "Swathi Reddy", headline: "AS400 Engineer", university: "u-anna", company: "c-ust", role: "AS400/iSeries Software Engineer", skills: [["s-as400", "advanced"], ["s-java", "intermediate"]] },
  { id: "p-imran", name: "Imran Qureshi", headline: "SDE Intern", university: "u-nit-trichy", company: "c-zoho", role: "SDE Intern", skills: [["s-node", "intermediate"], ["s-react", "beginner"]] },
  { id: "p-roshan", name: "Roshan K", headline: "Fresher — Full Stack & Blockchain", university: "u-kalasalingam", company: "", role: "", skills: [["s-react", "intermediate"], ["s-spring", "intermediate"], ["s-node", "intermediate"], ["s-postgres", "intermediate"], ["s-typescript", "intermediate"], ["s-solidity", "beginner"], ["s-web3", "beginner"]] },
];

// Professional connections (directed KNOWS with a trust/closeness weight 0-1).
// Deliberately not fully connected — that's what makes the path-finding demo meaningful.
export const knows: [string, string, number][] = [
  ["p-roshan", "p-divya", 0.9],
  ["p-roshan", "p-vikram", 0.7],
  ["p-roshan", "p-swathi", 0.8],
  ["p-divya", "p-arjun", 0.8],
  ["p-vikram", "p-meena", 0.6],
  ["p-vikram", "p-rohit", 0.7],
  ["p-swathi", "p-arjun", 0.9],
  ["p-meena", "p-rohit", 0.5],
  ["p-rohit", "p-rahul", 0.4],
  ["p-arjun", "p-lakshmi", 0.5],
  ["p-lakshmi", "p-karthik", 0.6],
  ["p-rahul", "p-priya", 0.6],
  ["p-priya", "p-imran", 0.5],
  ["p-suresh", "p-ananya", 0.7],
  ["p-ananya", "p-farhan", 0.5],
  ["p-farhan", "p-sneha", 0.6],
  ["p-imran", "p-sneha", 0.4],
];

export const jobPostings = [
  { id: "j-ust-as400", title: "AS400/iSeries Software Engineer", seniority: "Entry", company: "c-ust", requires: ["s-as400", "s-java"] },
  { id: "j-siemens-trainee", title: "Software Trainee Engineer", seniority: "Entry", company: "c-siemens", requires: ["s-python", "s-postgres"] },
  { id: "j-deloitte-dec", title: "DEC Executive - Full Stack Development", seniority: "Entry", company: "c-deloitte", requires: ["s-react", "s-node", "s-spring"] },
  { id: "j-zoho-backend", title: "Backend Engineer", seniority: "Entry-Mid", company: "c-zoho", requires: ["s-java", "s-spring", "s-postgres"] },
  { id: "j-freshworks-product", title: "Product Engineer", seniority: "Entry-Mid", company: "c-freshworks", requires: ["s-react", "s-typescript", "s-node"] },
  { id: "j-infosys-dse", title: "Digital Specialist Engineer", seniority: "Entry", company: "c-infosys", requires: ["s-java", "s-dsa"] },
];
