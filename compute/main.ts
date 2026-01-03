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

// DNS is now handled by Cloudflare Tunnel - no sync needed

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
    .use(cors())
    .onBeforeHandle(() => { lastActivity = Date.now(); })

    .get("/health", () => ({ status: "warm", engine: "qwen-3-32b" }))

    .get("/resume", async () => await Bun.file("resume.tex").text())

    .get("/pdf", async () => {
        const file = Bun.file("resume.pdf");
        if (await file.exists()) {
            return new Response(file, {
                headers: { 'Content-Type': 'application/pdf' }
            });
        }
        return { error: "PDF not found" };
    })

    .get("/download", async () => {
        const file = Bun.file("resume.pdf");
        if (await file.exists()) {
            return new Response(file, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': 'attachment; filename="resume.pdf"'
                }
            });
        }
        return { error: "PDF not found" };
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

        try {
            const proc = Bun.spawn(["tectonic", "preview.tex"], {
                stdout: "pipe",
                stderr: "pipe",
            });
            const text = await new Response(proc.stdout).text();
            const err = await new Response(proc.stderr).text();
            const { exitCode } = await proc.exited;

            if (exitCode !== 0) {
                set.status = 400;
                return {
                    error: "LaTeX Compilation Error",
                    logs: text + "\n" + err
                };
            }
            return new Response(Bun.file("preview.pdf"));
        } catch (e) {
            set.status = 500;
            return { error: "Server Error during compilation", logs: String(e) };
        }
    })

    .post("/update", async ({ body, set }: any) => {
        if (!(await checkSpend())) {
            set.status = 402;
            return { error: "Daily budget exceeded" };
        }

        let tex = await Bun.file("resume.tex").text();

        // Bedrock Invoke - Qwen uses OpenAI-compatible messages format
        const response = await bedrock.send(new InvokeModelCommand({
            modelId: "qwen.qwen3-32b-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "You are a LaTeX Architect. You generate JSON patches to modify LaTeX resumes. Return ONLY raw JSON, no markdown, no explanation."
                    },
                    {
                        role: "user",
                        content: `Current LaTeX:\n\`\`\`latex\n${tex}\n\`\`\`\n\nInstruction: ${body.instruction}\nContext: ${body.job_description || "N/A"}\n\nResponse format: { "patches": [{ "search": "exact string", "replace": "new string" }] }`
                    }
                ],
                max_tokens: 4096,
                temperature: 0.1
            })
        }));

        // Cost Accounting (placeholder - actual token counts from response if available)
        await logSpend(0.001); // Approximate cost per request

        const resBody = JSON.parse(new TextDecoder().decode(response.body));
        // OpenAI-compatible format: choices[0].message.content
        const generated = resBody.choices?.[0]?.message?.content || resBody.output?.text || resBody.generation || "";
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

    // Static file serving (fallback for frontend)
    .get("/*", async ({ params, set }: any) => {
        const path = params["*"] || "";

        // MIME type mapping
        const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.txt': 'text/plain',
        };

        const getContentType = (filepath: string) => {
            const ext = filepath.substring(filepath.lastIndexOf('.'));
            return mimeTypes[ext] || 'application/octet-stream';
        };

        // Try exact path first
        let filePath = `public/${path}`;
        let file = Bun.file(filePath);

        if (await file.exists()) {
            return new Response(file, {
                headers: { 'Content-Type': getContentType(filePath) }
            });
        }

        // Try with index.html for directory paths
        if (!path || !path.includes('.')) {
            filePath = path ? `public/${path}/index.html` : 'public/index.html';
            file = Bun.file(filePath);

            if (await file.exists()) {
                return new Response(file, {
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        }

        // 404 fallback
        set.status = 404;
        return { error: "Not found" };
    })
    .listen(8000);

// Ignition
await initRepo();
console.log("🚀 Resume Backend Online | Port 8000");