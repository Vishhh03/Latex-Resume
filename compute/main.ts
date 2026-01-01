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

const SPEND_LIMIT = 1.00; // $1.00 USD

// 1. Cloudflare DNS Self-Announcement
const syncDNS = async () => {
  try {
    const ip = await fetch('https://checkip.amazonaws.com').then(r => r.text());
    await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID}/dns_records/${process.env.CF_RECORD_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ip.trim(), ttl: 60, proxied: false })
    });
    console.log(`[Phantom] DNS updated to ${ip.trim()}`);
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

// 2. Self-Destruct Timer
setInterval(async () => {
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

    await logSpend(0.005); // Log ~$0.005 per call

    const responseBody = new TextDecoder().decode(response.body);
    const result = JSON.parse(responseBody);
    const generatedText = result.generation || result.completion || "";

    // 4. Parse JSON from LLM
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

    // 5. Apply Patches
    patches.forEach((p: any) => {
      // Simple string replace
      tex = tex.replace(p.search, p.replace);
    });
    await Bun.write("resume.tex", tex);

    // 6. Compile PDF
    const proc = Bun.spawn(["tectonic", "resume.tex"]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      set.status = 500;
      return { error: "LaTeX compilation failed" };
    }

    return new Response(Bun.file("resume.pdf"));
  })
  .listen(8000);

syncDNS();
console.log("Phantom Backend Listening on 8000");