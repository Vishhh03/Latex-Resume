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
 * 1. LOGGING HELPER
 */
function log(module: string, message: string, data?: any) {
    const time = new Date().toISOString();
    if (data) {
        console.log(`[${time}] [${module}] ${message}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${time}] [${module}] ${message}`);
    }
}

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
        UpdateExpression: "ADD #t :cost",
        ExpressionAttributeNames: { "#t": "total" },
        ExpressionAttributeValues: { ":cost": { N: cost.toString() } }
    }));
}

/**
 * 3. IDLE SHUTDOWN MONITOR
 */
setInterval(async () => {
    try { await logSpend(COST_PER_MIN_ECS); } catch (e) { }

    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        log("System", "Idle timeout. Terminating Fargate Task...");
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
    if (!process.env.GITHUB_TOKEN) {
        log("Git", "No GITHUB_TOKEN found. Skipping Git init.");
        return;
    }
    const remote = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.REPO_OWNER}/${process.env.REPO_NAME}.git`;

    log("Git", "Initializing repository...");
    Bun.spawnSync(["git", "init"]);
    Bun.spawnSync(["git", "config", "user.email", "bot@terraless.io"]);
    Bun.spawnSync(["git", "config", "user.name", "QwenArchitect"]);

    // Ensure we are on 'main' branch locally
    log("Git", "Enforcing local branch 'main'");
    Bun.spawnSync(["git", "checkout", "-B", "main"]);

    try {
        Bun.spawnSync(["git", "remote", "add", "origin", remote]);
    } catch { } // Remote might exist

    log("Git", "Syncing main from origin...");
    const fetchProc = Bun.spawnSync(["git", "fetch", "origin", "main"]);
    if (fetchProc.exitCode !== 0) {
        log("Git", "Fetch failed", { stderr: new TextDecoder().decode(fetchProc.stderr) });
    }

    const resetProc = Bun.spawnSync(["git", "reset", "--hard", "origin/main"]);
    if (resetProc.exitCode !== 0) {
        log("Git", "Reset failed", { stderr: new TextDecoder().decode(resetProc.stderr) });
    }

    // Compile PDF on startup so /pdf works immediately
    log("Init", "Compiling initial PDF...");
    const proc = Bun.spawn(["latexmk", "-xelatex", "-interaction=nonstopmode", "resume.tex"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const { exitCode } = await proc.exited;

    if (exitCode !== 0) {
        log("Init", "Initial compilation failed.", { stdout, stderr });
    } else {
        log("Init", "Initial compilation successful.");
    }
}

async function commitToGit(msg: string): Promise<{ pushed: boolean; message: string }> {
    log("Git", "Starting commit sequence", { message: msg });

    // Stage changes
    const add = Bun.spawnSync(["git", "add", "resume.tex"]);
    if (add.exitCode !== 0) {
        const err = new TextDecoder().decode(add.stderr);
        log("Git", "Add failed", { stderr: err });
        throw new Error("Git add failed: " + err);
    }

    // Check if there are changes to commit
    const status = Bun.spawnSync(["git", "status", "--porcelain"]);
    const statusOutput = new TextDecoder().decode(status.stdout);
    log("Git", "Status check", { output: statusOutput });

    if (!statusOutput.trim()) {
        log("Git", "No changes to commit, skipping.");
        return { pushed: false, message: "No changes to commit" };
    }

    // Commit
    const commit = Bun.spawnSync(["git", "commit", "-m", msg]);
    if (commit.exitCode !== 0) {
        const err = new TextDecoder().decode(commit.stderr);
        log("Git", "Commit failed", { stderr: err });
        throw new Error("Commit failed: " + err);
    }

    // Push
    log("Git", "Pushing to origin...");
    const push = Bun.spawnSync(["git", "push", "origin", "main"]);
    if (push.exitCode !== 0) {
        const stdout = new TextDecoder().decode(push.stdout);
        const stderr = new TextDecoder().decode(push.stderr);
        log("Git", "Push failed", { stdout, stderr });
        throw new Error("Push failed: " + stderr);
    }

    log("Git", "Successfully pushed to GitHub");
    return { pushed: true, message: "Changes pushed to GitHub" };
}

/**
 * 5. ELYSIA SERVER
 */
// --- SECURITY UTILS ---
function sanitizeLatex(latex: string): string {
    const dangerous = [
        "\\input", "\\include", "\\write", "\\openout",
        "\\immediate", "\\appto", "\\verbatiminput", "\\import"
    ];
    for (const cmd of dangerous) {
        if (latex.includes(cmd)) {
            throw new Error(`Security Violation: Command '${cmd}' is not allowed.`);
        }
    }
    return latex;
}

new Elysia()
    .use(cors())
    .onRequest(({ set }) => {
        lastActivity = Date.now();
        // Security Headers
        set.headers["X-Frame-Options"] = "SAMEORIGIN";
        set.headers["X-Content-Type-Options"] = "nosniff";
        set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        set.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    })

    .get("/health", () => ({ status: "warm", engine: "qwen-3-32b" }))

    .get("/resume", async () => await Bun.file("resume.tex").text())

    .get("/pdf", async ({ set }) => {
        const file = Bun.file("resume.pdf");
        if (await file.exists()) {
            return new Response(file, {
                headers: { 'Content-Type': 'application/pdf' }
            });
        }

        // PDF doesn't exist - compile it now
        log("PDF", "PDF not found, compiling on-demand...");
        const proc = Bun.spawn(["latexmk", "-xelatex", "-interaction=nonstopmode", "resume.tex"], {
            stdout: "pipe",
            stderr: "pipe",
        });
        await proc.exited;

        const compiled = Bun.file("resume.pdf");
        if (await compiled.exists()) {
            log("PDF", "On-demand compilation successful");
            return new Response(compiled, {
                headers: { 'Content-Type': 'application/pdf' }
            });
        }

        set.status = 500;
        return { error: "Compilation failed" };
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
        const proc = Bun.spawn(["git", "log", "--pretty=format:%h|%s|%an|%ad", "--date=short", "-n", "10"]);
        const output = await new Response(proc.stdout).text();

        return output.split("\n").filter(Boolean).map(line => {
            const [sha, message, author, date] = line.split("|");
            return { sha, message, author, date };
        });
    })

    .post("/commit", async ({ body, set }: any) => {
        const msg = body.message || "Manual Commit";
        try {
            const result = await commitToGit(msg);
            return { status: "success", pushed: result.pushed, message: result.message };
        } catch (e: any) {
            set.status = 500;
            return { status: "error", error: e.message || String(e) };
        }
    })

    .post("/stop", async () => {
        log("System", "Stop request received. Terminating Fargate Task...");
        try {
            const meta = await fetch("http://169.254.170.2/v2/metadata").then(r => r.json());
            await ecs.send(new StopTaskCommand({
                cluster: process.env.CLUSTER_NAME,
                task: meta.TaskARN
            }));
            return { status: "stopping", message: "Container shutting down..." };
        } catch (e) {
            return { status: "error", message: String(e) };
        }
    })

    .post("/save", async ({ body }: any) => {
        if (!body.latex) return { error: "No content" };
        try {
            const safeTex = sanitizeLatex(body.latex);
            await Bun.write("resume.tex", safeTex);
            return { status: "saved" };
        } catch (e) {
            return { error: String(e) };
        }
    })

    .post("/preview", async ({ body, set }: any) => {
        const startTime = Date.now();
        if (!body.latex) return { error: "No content" };

        try {
            const safeTex = sanitizeLatex(body.latex);
            await Bun.write("preview.tex", safeTex);
            console.log(`[Preview] Write: ${Date.now() - startTime}ms`);
        } catch (e) {
            set.status = 400;
            return { error: String(e) };
        }

        try {
            const compileStart = Date.now();
            const proc = Bun.spawn(["latexmk", "-xelatex", "-interaction=nonstopmode", "preview.tex"], {
                stdout: "pipe",
                stderr: "pipe",
            });
            const text = await new Response(proc.stdout).text();
            const err = await new Response(proc.stderr).text();
            const { exitCode } = await proc.exited;
            console.log(`[Preview] latexmk: ${Date.now() - compileStart}ms`);

            // Exit code 0 = success, 1 = warnings only (still success), >= 2 = error
            if (exitCode >= 2) {
                set.status = 400;
                return {
                    error: "LaTeX Compilation Error",
                    logs: text + "\n" + err
                };
            }
            console.log(`[Preview] Total: ${Date.now() - startTime}ms`);
            return new Response(Bun.file("preview.pdf"));
        } catch (e) {
            set.status = 500;
            return { error: "Server Error during compilation", logs: String(e) };
        }
    })

    .post("/update", async ({ body, set }: any) => {
        if (!(await checkSpend())) {
            log("AI", "Quota exceeded", { limit: SPEND_LIMIT });
            set.status = 402;
            return { error: "Daily budget exceeded" };
        }

        let tex = await Bun.file("resume.tex").text();
        log("AI", "Processing update request", { instruction: body.instruction });

        let resBody;
        try {
            // Bedrock Invoke - Qwen uses OpenAI-compatible messages format
            const payload = JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: `You are a LaTeX resume editor. Generate JSON patches to modify the resume.

CRITICAL RULES:
1. Return ONLY raw JSON - no markdown, no explanation, no code blocks
2. The "search" field must be an EXACT substring from the current LaTeX
3. Escape special characters: $ as \\$, % as \\%, & as \\&, # as \\#
4. Use \\textbf{} for bold, \\textit{} for italic, \\url{} for links
5. Keep the same document structure (\\cventry, \\cvitem, \\begin{itemize}...)
6. Never add packages or change preamble unless specifically asked`
                    },
                    {
                        role: "user",
                        content: `Current LaTeX:\n\`\`\`\n${tex}\n\`\`\`\n\nInstruction: ${body.instruction}\nJob Context: ${body.job_description || "N/A"}\n\nRespond with: { "patches": [{ "search": "exact existing text", "replace": "new text" }] }`
                    }
                ],
                max_tokens: 4096,
                temperature: 0.1
            });

            log("AI", "Sending payload to Bedrock", { payloadLength: payload.length });

            const response = await bedrock.send(new InvokeModelCommand({
                modelId: "qwen.qwen3-32b-v1:0",
                contentType: "application/json",
                accept: "application/json",
                body: new TextEncoder().encode(payload)
            }));

            // Cost Accounting (placeholder - actual token counts from response if available)
            await logSpend(0.001); // Approximate cost per request

            const rawBody = new TextDecoder().decode(response.body);
            log("AI", "Received Bedrock response", { rawResponseLength: rawBody.length });

            resBody = JSON.parse(rawBody);
        } catch (bedrockErr: any) {
            log("AI", "Bedrock interaction failed", { error: bedrockErr.message });
            set.status = 500;
            return { error: "AI service error: " + (bedrockErr.message || String(bedrockErr)) };
        }

        // OpenAI-compatible format: choices[0].message.content
        const generated = resBody.choices?.[0]?.message?.content || resBody.output?.text || resBody.generation || "";
        log("AI", "Parsed generation", { generated });

        const jsonMatch = generated.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            log("AI", "Invalid JSON in response", { generated });
            set.status = 500;
            return { error: "AI response was not valid JSON", raw: generated };
        }

        try {
            const { patches } = JSON.parse(jsonMatch[0]);
            log("AI", "Applying patches", { count: patches.length, patches });

            // Apply patches with uniqueness check
            for (const p of patches) {
                // Escape special regex characters in search string
                const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp(escapeRegExp(p.search), 'g');

                const matches = tex.match(searchRegex);
                const count = matches ? matches.length : 0;

                if (count === 0) {
                    throw new Error(`Text not found: "${p.search.substring(0, 50)}..."`);
                }
                if (count > 1) {
                    throw new Error(`Ambiguous match: Found ${count} occurrences of "${p.search.substring(0, 50)}...". Aborting to prevent corruption.`);
                }

                // Safe to replace
                tex = tex.replace(p.search, p.replace);
            }

            await Bun.write("resume.tex", tex);
            const proc = Bun.spawn(["latexmk", "-xelatex", "-interaction=nonstopmode", "resume.tex"], {
                stdout: "pipe",
                stderr: "pipe",
            });
            const stdout = await new Response(proc.stdout).text();
            const stderr = await new Response(proc.stderr).text();
            const { exitCode } = await proc.exited;

            if (exitCode !== 0) {
                // Try to extract the actual error from the log
                const errorMatch = stdout.match(/! .+/g) || stderr.match(/! .+/g);
                log("AI", "Compilation failed after patch", { stdout: stdout.slice(-500), stderr: stderr.slice(-500) });
                set.status = 500;
                return {
                    error: "Compilation failed after patch",
                    details: errorMatch ? errorMatch.join('\n') : "Check LaTeX syntax",
                    logs: (stdout + stderr).slice(-2000) // Last 2KB of logs
                };
            }

            log("AI", "Update successful");

            // Return JSON so frontend can handle state (Undo/Redo)
            return {
                status: "success",
                latex: tex,
                pdfUrl: "/pdf?t=" + Date.now() // Cache busting
            };

        } catch (e) {
            log("AI", "Patch application failed", { error: String(e) });
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
log("System", "Resume Backend Online | Port 8000");