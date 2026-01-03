import { Elysia } from 'elysia';
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
 * 4. GIT HELPERS
 */
async function initRepo() {
    if (!process.env.GITHUB_TOKEN) return;
    const remote = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO_OWNER}/${process.env.REPO_NAME}.git`;

    Bun.spawnSync(["git", "init"]);
    Bun.spawnSync(["git", "config", "user.email", "bot@terraless.io"]);
    Bun.spawnSync(["git", "config", "user.name", "QwenArchitect"]);
    try {
        Bun.spawnSync(["git", "remote", "add", "origin", remote]);
    } catch { } // Remote might exist

    console.log("[Git] Syncing main...");
    Bun.spawnSync(["git", "fetch", "origin", "main"]);
    Bun.spawnSync(["git", "reset", "--hard", "origin/main"]);

    // Compile PDF on startup so /pdf works immediately
    console.log("[Init] Compiling initial PDF...");
    const { exitCode } = Bun.spawnSync(["tectonic", "resume.tex"]);
    if (exitCode !== 0) console.error("[Init] Initial compilation failed.");
}

async function commitToGit(msg: string) {
    Bun.spawnSync(["git", "add", "resume.tex"]);
    Bun.spawnSync(["git", "commit", "-m", msg]);
    const { exitCode } = Bun.spawnSync(["git", "push", "origin", "main"]);
    if (exitCode !== 0) throw new Error("Push failed");
}

/**
 * 5. ELYSIA SERVER
 */
new Elysia()
    .use(cors({
        origin: [/.*\.vercel\.app$/, 'localhost:3000'],
        methods: ['GET', 'POST', 'OPTIONS']
    }))
    .onBeforeHandle(() => { lastActivity = Date.now(); })

    .get("/health", () => ({ status: "warm", engine: "qwen-3-32b" }))

    .get("/resume", async () => await Bun.file("resume.tex").text())

    .get("/pdf", async () => {
        const file = Bun.file("resume.pdf");
        return (await file.exists()) ? new Response(file) : { error: "PDF not found" };
    })

    .get("/history", async () => {
        const cmd = ["git", "log", "--pretty=format:%H|%s|%an|%aI", "-n", "10"];
        const proc = Bun.spawn(cmd, { stdout: "pipe" });
        const output = await new Response(proc.stdout).text();

        return output.split("\n").filter(Boolean).map(line => {
            const [sha, message, author, date] = line.split("|");
            return { sha, message, author, date };
        });
    })

    .post("/commit", async ({ body }: any) => {
        const msg = body.message || "Manual Commit";
        try {
            await commitToGit(msg);
            return { status: "success", message: "Changes pushed to GitHub" };
        } catch (e) {
            return { status: "error", error: String(e) };
        }
    })

    .post("/save", async ({ body }: any) => {
        if (!body.latex) return { error: "No content" };
        await Bun.write("resume.tex", body.latex);
        return { status: "saved" };
    })

    .post("/preview", async ({ body, set }: any) => {
        if (!body.latex) return { error: "No content" };
        await Bun.write("preview.tex", body.latex);

        const proc = Bun.spawn(["tectonic", "preview.tex"]);
        const { exitCode } = await proc.exited;
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
Current LaTeX: \`\`\`latex
${tex}
\`\`\`
Instruction: ${body.instruction}
Context: ${body.job_description || "N/A"}

Response format: { "patches": [{ "search": "exact string", "replace": "new string" }] }
Return ONLY raw JSON.`;

        // Bedrock Invoke
        const response = await bedrock.send(new InvokeModelCommand({
            modelId: "qwen.qwen3-32b-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                prompt: prompt,
                max_tokens: 4096,
                temperature: 0.1
            })
        }));

        // Cost Accounting
        const responseHeaders = response.$metadata.httpStatusCode === 200 ? {} : {};
        const iTokens = 0; // Token counts from response metadata if available
        const oTokens = 0;
        await logSpend((iTokens * COST_IN_TOKENS) + (oTokens * COST_OUT_TOKENS));

        const resBody = JSON.parse(new TextDecoder().decode(response.body));
        const generated = resBody.output?.text || resBody.generation || resBody.choices?.[0]?.text || "";
        const jsonMatch = generated.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            set.status = 500;
            return { error: "AI response was not valid JSON", raw: generated };
        }

        try {
            const { patches } = JSON.parse(jsonMatch[0]);
            patches.forEach((p: any) => { tex = tex.split(p.search).join(p.replace); });

            await Bun.write("resume.tex", tex);
            const proc = Bun.spawn(["tectonic", "resume.tex"]);
            const { exitCode } = await proc.exited;

            if (exitCode !== 0) {
                set.status = 500;
                return { error: "Compilation failed after patch" };
            }

            // Return JSON so frontend can handle state (Undo/Redo)
            return {
                status: "success",
                latex: tex,
                pdfUrl: "/pdf?t=" + Date.now() // Cache busting
            };

        } catch (e) {
            set.status = 500;
            return { error: "Failed to apply patches: " + String(e) };
        }
    })
    .listen(8000);

// Ignition
syncDNS();
await initRepo();
console.log("🚀 Resume Backend Online | Port 8000");