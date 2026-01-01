import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 mins
let lastActivity = Date.now();

// AWS Clients
const ecs = new ECSClient({ region: "us-east-1" });
const db = new DynamoDBClient({ region: "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

const SPEND_LIMIT = 0.50; // $0.50 USD

// 1. Cloudflare DNS Self-Announcement
const syncDNS = async () => {
  try {
    const ip = await fetch('https://checkip.amazonaws.com').then(r => r.text());
    await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID}/dns_records/${process.env.CF_RECORD_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ip.trim(), ttl: 60, proxied: false })
    });
    console.log(`[Resume] DNS updated to ${ip.trim()}`);
  } catch (e) {
    console.error("DNS Sync Failed:", e);
  }
};

// Helper: Check Daily Spend
async function checkSpend() {
  const today = new Date().toISOString().split('T')[0];
  const current = await db.send(new GetItemCommand({
    TableName: "DailySpend",
    Key: { date: { S: today } }
  }));
  const total = parseFloat(current.Item?.total?.N || "0");
  return total < SPEND_LIMIT;
}

// Helper: Log Spend (Approximation)
async function logSpend(cost: number) {
  const today = new Date().toISOString().split('T')[0];
  await db.send(new UpdateItemCommand({
    TableName: "DailySpend",
    Key: { date: { S: today } },
    UpdateExpression: "ADD total :cost",
    ExpressionAttributeValues: { ":cost": { N: cost.toString() } }
  }));
}

// Cost Constants (USD)
const COST_PER_MIN_ECS = 0.00005; // Fargate Spot (0.25 vCPU, 0.5GB)
const COST_IN_TOKENS = 0.00000265; // Llama 3 70B Input
const COST_OUT_TOKENS = 0.0000035; // Llama 3 70B Output

// 2. Runtime Cost Meter (Every minute)
setInterval(async () => {
  try {
    await logSpend(COST_PER_MIN_ECS);
  } catch (e) { console.error("Failed to log runtime cost", e); } // Don't crash on logging fail

  if (Date.now() - lastActivity > IDLE_TIMEOUT) {
    console.log("Idle timeout reached. Shutting down...");
    const meta = await fetch("http://169.254.170.2/v2/metadata").then(r => r.json());
    await ecs.send(new StopTaskCommand({ cluster: process.env.CLUSTER_NAME, task: meta.TaskARN }));
  }
}, 60000);

// 3. Elysia API
new Elysia()
  .use(cors())
  .onBeforeHandle(() => { lastActivity = Date.now(); })

  // Health Check
  .get("/health", () => ({ status: "warm" }))

  // --- Manual Editor Endpoints ---

  .get("/resume", async () => {
    // Security Note: Should be protected in production!
    return await Bun.file("resume.tex").text();
  })

  .post("/save", async ({ body }: any) => {
    if (!body.latex) return { error: "No latex content provided" };
    await Bun.write("resume.tex", body.latex);

    if (body.commit !== false) {
      try {
        await commitToGit(body.message || "Manual Update");
      } catch (e) { console.error("Git Push Failed:", e); }
    }

    return { status: "saved" };
  })

  .post("/preview", async ({ body, set }: any) => {
    // Ephemeral compile - ideally use a temp file or just overwrite main if single user
    if (!body.latex) return { error: "No latex content provided" };

    // For simplicity in single-user mode, we overwrite resume.tex temporarily
    // Ideally, write to `preview.tex`
    await Bun.write("preview.tex", body.latex);

    const proc = Bun.spawn(["tectonic", "preview.tex"]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      set.status = 500;
      return { error: "Compilation failed" };
    }
    return new Response(Bun.file("preview.pdf"));
  })

  // --- AI Update Endpoint ---

  .post("/update", async ({ body, set }: any) => {
    // 1. Security & Budget Check
    const allowed = await checkSpend();
    if (!allowed) {
      set.status = 402;
      return { error: "Daily budget exceeded." };
    }

    // 2. Read Resume & Prepare Prompt
    let tex = await Bun.file("resume.tex").text();
    const instruction = body.instruction;
    const jobDescription = body.job_description || "";

    const prompt = `
You are a LaTeX Resume Architect.
Current LaTeX content:
\`\`\`latex
${tex}
\`\`\`

Instruction: ${instruction}
Job Description Context: ${jobDescription}

Generate a list of JSON patches to update the resume.
Format: { "patches": [ { "search": "exact string to replace", "replace": "new string" } ] }
Return ONLY raw JSON.
`;

    // 3. Call Bedrock (Llama 3 70B)
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: "meta.llama3-70b-instruct-v1:0",
      body: JSON.stringify({
        prompt: prompt,
        max_gen_len: 2048,
        temperature: 0.2,
        top_p: 0.9
      })
    }));

    // 4. Calculate & Log Exact Cost
    // Headers handle token counts for Llama models on Bedrock
    const inputTokens = parseInt(response.headers["x-amzn-bedrock-input-token-count"] || "0");
    const outputTokens = parseInt(response.headers["x-amzn-bedrock-output-token-count"] || "0");
    const callCost = (inputTokens * COST_IN_TOKENS) + (outputTokens * COST_OUT_TOKENS);

    await logSpend(callCost);

    const responseBody = new TextDecoder().decode(response.body);
    const result = JSON.parse(responseBody);
    const generatedText = result.generation || result.completion || "";

    // 5. Parse JSON from LLM
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      set.status = 500;
      return { error: "Failed to parse AI response" };
    }

    let patches = [];
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      patches = parsed.patches || [];
    } catch (e) {
      set.status = 500;
      return { error: "Invalid JSON from AI" };
    }

    // 6. Apply Patches
    patches.forEach((p: any) => {
      // Simple string replace
      tex = tex.replace(p.search, p.replace);
    });
    await Bun.write("resume.tex", tex);

    // 7. Compile PDF
    const proc = Bun.spawn(["tectonic", "resume.tex"]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      set.status = 500;
      return { error: "LaTeX compilation failed" };
    }

    // 8. Commit to Git
    // 8. Commit to Git (Optional)
    if (body.commit !== false) {
      try {
        await commitToGit(`AI Update: ${instruction.slice(0, 50)}...`);
      } catch (e) {
        console.error("Git Push Failed:", e);
      }
    }

    return new Response(Bun.file("resume.pdf"));
  })
  .listen(8000);

// Git Helper
async function commitToGit(msg: string) {
  if (!process.env.GITHUB_TOKEN) return;

  const remote = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO_OWNER}/${process.env.REPO_NAME}.git`;

  // Configure if not already (redundant but safe)
  Bun.spawnSync(["git", "config", "user.email", "ai-writer@bot"]);
  Bun.spawnSync(["git", "config", "user.name", "Ghost Writer"]);

  // Check if remote exists, remove to be safe, set new
  Bun.spawnSync(["git", "remote", "remove", "origin"]);
  Bun.spawnSync(["git", "remote", "add", "origin", remote]);

  // Add, Commit, Push
  Bun.spawnSync(["git", "add", "resume.tex"]);
  Bun.spawnSync(["git", "commit", "-m", msg]);

  const push = Bun.spawnSync(["git", "push", "--set-upstream", "origin", "main"]);
  if (push.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(push.stderr));
  }
  console.log("Git Pushed Successfully");
}

syncDNS();
console.log("Resume Backend Listening on 8000");