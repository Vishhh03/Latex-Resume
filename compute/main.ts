import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * CONFIGURATION & CONSTANTS
 */
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 mins
let lastActivity = Date.now();

const SPEND_LIMIT = 0.50; // $0.50 USD Daily
const COST_PER_MIN_ECS = 0.00005; // Fargate Spot (0.25 vCPU, 0.5GB)
const COST_IN_TOKENS = 0.00000030; // Qwen 3 32B Input
const COST_OUT_TOKENS = 0.00000090; // Qwen 3 32B Output

// AWS Clients
const ecs = new ECSClient({ region: "us-east-1" });
const db = new DynamoDBClient({ region: "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

/**
 * 1. VERCEL DNS SELF-ANNOUNCEMENT
 * Replaces Cloudflare logic to update your A record on Vercel
 */
const syncDNS = async () => {
  try {
    const ip = (await fetch('https://checkip.amazonaws.com').then(r => r.text())).trim();
    
    // Vercel API: PATCH /v1/domains/records/:recordId
    const response = await fetch(`https://api.vercel.com/v1/domains/records/${process.env.VERCEL_RECORD_ID}`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        value: ip,
        ttl: 60
      })
    });

    if (!response.ok) throw new Error(await response.text());
    console.log(`[Resume] Vercel DNS updated to ${ip}`);
  } catch (e) {
    console.error("Vercel DNS Sync Failed:", e);
  }
};

/**
 * 2. BUDGET & SPEND HELPERS
 */
async function checkSpend() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const current = await db.send(new GetItemCommand({
      TableName: "DailySpend",
      Key: { date: { S: today } }
    }));
    const total = parseFloat(current.Item?.total?.N || "0");
    return total < SPEND_LIMIT;
  } catch (e) {
    return true; // Fail open if DB is down, or change to false for strictness
  }
}

async function logSpend(cost: number) {
  const today = new Date().toISOString().split('T')[0];
  await db.send(new UpdateItemCommand({
    TableName: "DailySpend",
    Key: { date: { S: today } },
    UpdateExpression: "ADD total :cost",
    ExpressionAttributeValues: { ":cost": { N: cost.toString() } }
  }));
}

/**
 * 3. RUNTIME MONITORING
 */
setInterval(async () => {
  try { await logSpend(COST_PER_MIN_ECS); } catch (e) {}

  if (Date.now() - lastActivity > IDLE_TIMEOUT) {
    console.log("Idle timeout reached. Shutting down...");
    const meta = await fetch("http://169.254.170.2/v2/metadata").then(r => r.json());
    await ecs.send(new StopTaskCommand({ cluster: process.env.CLUSTER_NAME, task: meta.TaskARN }));
  }
}, 60000);

/**
 * 4. ELYSIA API ROUTES
 */
new Elysia()
  .use(cors())
  .onBeforeHandle(() => { lastActivity = Date.now(); })

  .get("/health", () => ({ status: "warm", model: "qwen-3-32b" }))

  .get("/resume", async () => await Bun.file("resume.tex").text())

  .post("/save", async ({ body }: any) => {
    if (!body.latex) return { error: "No latex content provided" };
    await Bun.write("resume.tex", body.latex);
    if (body.commit !== false) {
      try { await commitToGit(body.message || "Manual Update"); } catch (e) { console.error(e); }
    }
    return { status: "saved" };
  })

  .post("/preview", async ({ body, set }: any) => {
    if (!body.latex) return { error: "No latex content provided" };
    await Bun.write("preview.tex", body.latex);
    const proc = Bun.spawn(["tectonic", "preview.tex"]);
    await proc.exited;
    if (proc.exitCode !== 0) {
      set.status = 500;
      return { error: "Compilation failed" };
    }
    return new Response(Bun.file("preview.pdf"));
  })

  .post("/update", async ({ body, set }: any) => {
    // Budget Guard
    if (!(await checkSpend())) {
      set.status = 402;
      return { error: "Daily budget exceeded." };
    }

    let tex = await Bun.file("resume.tex").text();
    const prompt = `You are a LaTeX Resume Architect.
Current LaTeX content:
\`\`\`latex
${tex}
\`\`\`
Instruction: ${body.instruction}
Job Description Context: ${body.job_description || ""}

Generate a list of JSON patches to update the resume.
Format: { "patches": [ { "search": "exact string to replace", "replace": "new string" } ] }
Return ONLY raw JSON.`;

    // Bedrock Call: Qwen 3 32B
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: "qwen.qwen3-32b-instruct",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 4096,
        temperature: 0.1,
        top_p: 0.9,
        stop: ["<|endoftext|>", "<|im_end|>"]
      })
    }));

    // Cost Logging
    const inputTokens = parseInt(response.headers["x-amzn-bedrock-input-token-count"] || "0");
    const outputTokens = parseInt(response.headers["x-amzn-bedrock-output-token-count"] || "0");
    await logSpend((inputTokens * COST_IN_TOKENS) + (outputTokens * COST_OUT_TOKENS));

    const resBody = JSON.parse(new TextDecoder().decode(response.body));
    const generatedText = resBody.output?.text || resBody.generation || "";

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      set.status = 500;
      return { error: "AI failed to return valid JSON patches" };
    }

    try {
      const { patches } = JSON.parse(jsonMatch[0]);
      patches.forEach((p: any) => { tex = tex.replace(p.search, p.replace); });
      await Bun.write("resume.tex", tex);

      const proc = Bun.spawn(["tectonic", "resume.tex"]);
      await proc.exited;

      if (proc.exitCode === 0 && body.commit !== false) {
        await commitToGit(`AI Update: ${body.instruction.slice(0, 50)}`);
      }

      return new Response(Bun.file("resume.pdf"));
    } catch (e) {
      set.status = 500;
      return { error: "Patch application failed" };
    }
  })
  .listen(8000);

/**
 * 5. GIT & REPO MANAGEMENT
 */
async function initRepo() {
  if (!process.env.GITHUB_TOKEN) return;
  const remote = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO_OWNER}/${process.env.REPO_NAME}.git`;

  Bun.spawnSync(["git", "init"]);
  Bun.spawnSync(["git", "config", "user.email", "ai-writer@bot"]);
  Bun.spawnSync(["git", "config", "user.name", "Ghost Writer"]);
  Bun.spawnSync(["git", "remote", "remove", "origin"]);
  Bun.spawnSync(["git", "remote", "add", "origin", remote]);
  
  console.log("Syncing with remote...");
  Bun.spawnSync(["git", "fetch", "origin", "main"]);
  Bun.spawnSync(["git", "reset", "--hard", "origin/main"]);
}

async function commitToGit(msg: string) {
  Bun.spawnSync(["git", "add", "resume.tex"]);
  Bun.spawnSync(["git", "commit", "-m", msg]);
  const push = Bun.spawnSync(["git", "push", "origin", "main"]);
  if (push.exitCode !== 0) throw new Error("Git push failed");
}

// Startup
syncDNS();
await initRepo();
console.log("Backend Live on Port 8000 (Vercel DNS + Qwen 3)");