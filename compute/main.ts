import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * CONFIGURATION & COST CONSTANTS
 */
const IDLE_TIMEOUT = 10 * 60 * 1000;
let lastActivity = Date.now();

const SPEND_LIMIT = 0.50;
const COST_PER_MIN_ECS = 0.00005;
const COST_IN_TOKENS = 0.00000030; // Qwen 3 32B Input
const COST_OUT_TOKENS = 0.00000090; // Qwen 3 32B Output

// AWS Clients
const ecs = new ECSClient({ region: "us-east-1" });
const db = new DynamoDBClient({ region: "us-east-1" });
const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

/**
 * 1. VERCEL DNS SYNC
 */
const syncDNS = async () => {
    // Skip DNS sync for .vercel.app domains (no custom domain configured)
    if (!process.env.VERCEL_RECORD_ID || !process.env.VERCEL_API_TOKEN) {
        console.log("[DNS] Skipped - No custom domain configured");
        return;
    }

    try {
        const ip = (await fetch('https://checkip.amazonaws.com').then(r => r.text())).trim();
        const response = await fetch(`https://api.vercel.com/v1/domains/records/${process.env.VERCEL_RECORD_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: ip, ttl: 60 })
        });

        if (!response.ok) throw new Error(await response.text());
        console.log(`[DNS] Vercel pointed to ${ip}`);
    } catch (e) {
        console.error("[DNS] Sync Failed:", e);
    }
};

/**
 * 2. SPEND MANAGEMENT
 */
async function checkSpend() {
    const today = new Date().toISOString().split('T')[0];
    try {
        const current = await db.send(new GetItemCommand({
            TableName: "DailySpend",
            Key: { date: { S: today } }
        }));
        return parseFloat(current.Item?.total?.N || "0") < SPEND_LIMIT;
    } catch (e) {
        return true; // Fail open for continuity
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
 * 3. IDLE SHUTDOWN MONITOR
 */
setInterval(async () => {
    try { await logSpend(COST_PER_MIN_ECS); } catch (e) { }

    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        console.log("[System] Idle timeout. Terminating Fargate Task...");
        const meta = await fetch("http://169.254.170.2/v2/metadata").then(r => r.json());
        await ecs.send(new StopTaskCommand({
            cluster: process.env.CLUSTER_NAME,
            task: meta.TaskARN
        }));
    }
}, 60000);

/**
 * 4. ELYSIA SERVER
 */
new Elysia()
    .use(cors({
        origin: [/.*\.vercel\.app$/, 'localhost:3000'], // Allow Vercel + Local Dev
        methods: ['GET', 'POST', 'OPTIONS']
    }))
    .onBeforeHandle(() => { lastActivity = Date.now(); })

    .get("/health", () => ({ status: "warm", engine: "qwen-3-32b" }))

    .get("/resume", async () => await Bun.file("resume.tex").text())

    .post("/save", async ({ body }: any) => {
        if (!body.latex) return { error: "No content" };
        await Bun.write("resume.tex", body.latex);
        if (body.commit !== false) {
            await commitToGit(body.message || "Manual Update").catch(console.error);
        }
        return { status: "saved" };
    })

    .post("/preview", async ({ body, set }: any) => {
        if (!body.latex) return { error: "No content" };
        await Bun.write("preview.tex", body.latex);

        const { exitCode } = await Bun.spawn(["tectonic", "preview.tex"]).exited;
        if (exitCode !== 0) {
            set.status = 500;
            return { error: "LaTeX Compilation Error" };
        }
        return new Response(Bun.file("preview.pdf"));
    })

    .post("/update", async ({ body, set }: any) => {
        if (!(await checkSpend())) {
            set.status = 402;
            return { error: "Daily budget exceeded" };
        }

        let tex = await Bun.file("resume.tex").text();
        const prompt = `You are a LaTeX Architect. Generate a JSON patch for this resume.
Current LaTeX: \`\`\`latex\n${tex}\n\`\`\`
Instruction: ${body.instruction}
Context: ${body.job_description || "N/A"}

Response format: { "patches": [{ "search": "exact string", "replace": "new string" }] }
Return ONLY raw JSON.`;

        // Bedrock Invoke
        const response = await bedrock.send(new InvokeModelCommand({
            modelId: "qwen.qwen3-32b-instruct",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                prompt: prompt,
                max_tokens: 4096,
                temperature: 0.1,
                stop: ["<|endoftext|>", "<|im_end|>"]
            })
        }));

        // Cost Accounting
        const iTokens = parseInt(response.headers["x-amzn-bedrock-input-token-count"] || "0");
        const oTokens = parseInt(response.headers["x-amzn-bedrock-output-token-count"] || "0");
        await logSpend((iTokens * COST_IN_TOKENS) + (oTokens * COST_OUT_TOKENS));

        const resBody = JSON.parse(new TextDecoder().decode(response.body));
        const generated = resBody.output?.text || resBody.generation || "";
        const jsonMatch = generated.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            set.status = 500;
            return { error: "AI response was not valid JSON" };
        }

        try {
            const { patches } = JSON.parse(jsonMatch[0]);
            patches.forEach((p: any) => { tex = tex.split(p.search).join(p.replace); });

            await Bun.write("resume.tex", tex);
            const { exitCode } = await Bun.spawn(["tectonic", "resume.tex"]).exited;

            if (exitCode === 0 && body.commit !== false) {
                await commitToGit(`AI: ${body.instruction.slice(0, 40)}`);
            }
            return new Response(Bun.file("resume.pdf"));
        } catch (e) {
            set.status = 500;
            return { error: "Failed to apply patches" };
        }
    })
    .listen(8000);

/**
 * 5. GIT HELPERS
 */
async function initRepo() {
    if (!process.env.GITHUB_TOKEN) return;
    const remote = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO_OWNER}/${process.env.REPO_NAME}.git`;

    Bun.spawnSync(["git", "init"]);
    Bun.spawnSync(["git", "config", "user.email", "bot@terraless.io"]);
    Bun.spawnSync(["git", "config", "user.name", "QwenArchitect"]);
    Bun.spawnSync(["git", "remote", "add", "origin", remote]);

    console.log("[Git] Syncing main...");
    Bun.spawnSync(["git", "fetch", "origin", "main"]);
    Bun.spawnSync(["git", "reset", "--hard", "origin/main"]);
}

async function commitToGit(msg: string) {
    Bun.spawnSync(["git", "add", "resume.tex"]);
    Bun.spawnSync(["git", "commit", "-m", msg]);
    const { exitCode } = Bun.spawnSync(["git", "push", "origin", "main"]);
    if (exitCode !== 0) throw new Error("Push failed");
}

// Ignition
syncDNS();
await initRepo();
console.log("🚀 Resume Backend Online | Port 8000");