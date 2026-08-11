#!/usr/bin/env node

const http = require('http');
const https = require('https');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const pkg = require('./package.json');

// ANSI Colors & Styles
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    red: '\x1b[31m'
};

const CONFIG = {
    name: 'Serverless Typst Resume Editor',
    version: pkg.version || '0.3.0',
    github: 'https://github.com/Vishhh03/Latex-Resume',
    webUrl: process.env.RESUME_WEB_URL || 'http://localhost:3000',
    apiUrl: process.env.RESUME_API_URL || 'https://oo7fsr4cy32q42bzkpgwhy7asu0hzaod.lambda-url.us-east-1.on.aws/',
};

const banner = `
${c.cyan}${c.bold}
 ████████╗██╗   ██╗██████╗ ███████╗████████╗
 ╚══██╔══╝╚██╗ ██╔╝██╔══██╗██╔════╝╚══██╔══╝
    ██║    ╚████╔╝ ██████╔╝███████╗   ██║   
    ██║     ╚██╔╝  ██╔═══╝ ╚════██║   ██║   
    ██║      ██║   ██║     ███████║   ██║   
    ╚═╝      ╚═╝   ╚═╝     ╚══════╝   ╚═╝   
${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${c.white}  Serverless Typst & Bedrock Resume Editor ${c.dim}(v${CONFIG.version})${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`;

function openUrl(url) {
    let command;
    if (process.platform === 'darwin') {
        command = `open "${url}"`;
    } else if (process.platform === 'win32') {
        command = `start "" "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }
    exec(command, (err) => {
        if (err) {
            console.log(`${c.yellow}Note: Could not open browser automatically (${err.message}). Please open ${url} manually.${c.reset}`);
        }
    });
}

function showHelp() {
    console.log(`
${c.bold}typst-resume-cli${c.reset} v${CONFIG.version} - ${pkg.description || 'Lightning-fast Serverless Typst & AI Resume Editor'}

${c.yellow}${c.bold}USAGE:${c.reset}
  $ npx typst-resume-cli [command] [options]

${c.yellow}${c.bold}COMMANDS:${c.reset}
  ${c.cyan}editor, open, start${c.reset}  Launch the local Web UI Resume Editor directly
  ${c.cyan}help${c.reset}               Display this help guide

${c.yellow}${c.bold}OPTIONS:${c.reset}
  ${c.cyan}-p, --port <number>${c.reset} Specify local server port (default: random free port)
  ${c.cyan}--no-open${c.reset}          Start server without automatically opening the browser
  ${c.cyan}-q, --quiet${c.reset}        Suppress ASCII banner output
  ${c.cyan}-v, --version${c.reset}      Display CLI version number
  ${c.cyan}-h, --help${c.reset}         Display this help guide

${c.yellow}${c.bold}ENVIRONMENT VARIABLES:${c.reset}
  ${c.cyan}RESUME_API_URL${c.reset}     Override target AWS Lambda backend URL
  ${c.cyan}RESUME_WEB_URL${c.reset}     Override frontend target URL

${c.yellow}${c.bold}EXAMPLES:${c.reset}
  $ npx typst-resume-cli
  $ npx typst-resume-cli open --port 3000
  $ npx typst-resume-cli --no-open
  $ RESUME_API_URL=https://your-lambda-url.aws npx typst-resume-cli
`);
}

function startLocalServer(options = {}) {
    const requestedPort = parseInt(options.port || process.env.PORT || '0', 10);
    const autoOpen = options.autoOpen !== false;

    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = parsedUrl.pathname;

            if (pathname === '/' || pathname === '/index.html') {
                const htmlPath = path.join(__dirname, 'editor.html');
                fs.readFile(htmlPath, 'utf8', (err, data) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error loading editor.html');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(data);
                });
                return;
            }

            if (pathname.startsWith('/api/')) {
                const targetSubpath = pathname.replace(/^\/api/, '');
                const baseUrl = CONFIG.apiUrl.endsWith('/') ? CONFIG.apiUrl : CONFIG.apiUrl + '/';
                const cleanSubpath = targetSubpath.startsWith('/') ? targetSubpath.slice(1) : targetSubpath;
                const targetUrl = new URL(cleanSubpath + parsedUrl.search, baseUrl);

                let bodyData = [];
                req.on('data', chunk => bodyData.push(chunk));
                req.on('end', () => {
                    const payload = Buffer.concat(bodyData);
                    
                    // Forward all headers except host & content-length to preserve custom BYOK headers (x-api-key, etc.)
                    const forwardedHeaders = { ...req.headers };
                    forwardedHeaders['host'] = targetUrl.hostname;
                    delete forwardedHeaders['connection'];
                    
                    if (payload.length > 0) {
                        forwardedHeaders['content-length'] = payload.length;
                    } else {
                        delete forwardedHeaders['content-length'];
                    }

                    const client = targetUrl.protocol === 'https:' ? https : http;
                    const reqOptions = {
                        hostname: targetUrl.hostname,
                        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                        path: targetUrl.pathname + targetUrl.search,
                        method: req.method,
                        headers: forwardedHeaders
                    };

                    const proxyReq = client.request(reqOptions, (proxyRes) => {
                        res.writeHead(proxyRes.statusCode, proxyRes.headers);
                        proxyRes.pipe(res);
                    });

                    proxyReq.on('error', (err) => {
                        console.error(`${c.red}Proxy error (${req.method} ${targetUrl.pathname}): ${err.message}${c.reset}`);
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Proxy connection error: ' + err.message }));
                    });

                    if (payload.length > 0) {
                        proxyReq.write(payload);
                    }
                    proxyReq.end();
                });
                return;
            }

            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        });

        server.on('error', (err) => {
            console.error(`${c.red}Server failed to start: ${err.message}${c.reset}`);
            reject(err);
        });

        server.listen(requestedPort, '127.0.0.1', () => {
            const port = server.address().port;
            const localUrl = `http://localhost:${port}`;
            console.log(`\n${c.green}⚡ Local Resume Editor active at ${c.bold}${localUrl}${c.reset}`);
            console.log(`${c.dim}📡 Proxying backend API requests to ${CONFIG.apiUrl}${c.reset}`);
            
            if (autoOpen) {
                console.log(`${c.dim}Opening embedded interface in your browser...${c.reset}\n`);
                openUrl(localUrl);
            } else {
                console.log(`${c.dim}Browser auto-open disabled. Open ${localUrl} in your browser.${c.reset}\n`);
            }
            console.log(`${c.dim}Press Ctrl+C to stop the server.${c.reset}\n`);
            resolve(server);
        });
    });
}

function showHowItWorks() {
    console.clear();
    console.log(`
${c.cyan}${c.bold}┌─────────────────────────────────────────────────────────────────────────┐${c.reset}
${c.cyan}${c.bold}│                HOW THE SERVERLESS RESUME EDITOR WORKS                   │${c.reset}
${c.cyan}${c.bold}└─────────────────────────────────────────────────────────────────────────┘${c.reset}

${c.yellow}THE SOLUTION:${c.reset}
  A lightning-fast Typst document engine combined with Amazon Bedrock Converse API
  for structured JSON resume updates with zero syntax errors.

${c.bold}ARCHITECTURE:${c.reset}

  ${c.dim}┌──────────────┐${c.reset}              ${c.dim}┌──────────────────────────┐${c.reset}
  ${c.dim}│${c.reset}  ${c.white}You (CLI/Web)${c.reset} ${c.dim}│${c.reset}   ${c.cyan}──────▶${c.reset}   ${c.dim}│${c.reset}    ${c.green}AWS Lambda Function URL${c.reset} ${c.dim}│${c.reset}
  ${c.dim}└──────────────┘${c.reset}              ${c.dim}└─────────────┬────────────┘${c.reset}
                                            ${c.dim}│${c.reset}
                                            ${c.dim}▼${c.reset}
  ${c.dim}┌──────────────────────────────────────────────────────────────────────┐${c.reset}
  ${c.dim}│${c.reset}  ${c.bold}AWS LAMBDA ENGINE (Sub-second execution)${c.reset}                             ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}                                                                        ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}    ${c.yellow}Bedrock Converse API${c.reset} ──▶  ${c.blue}JSON Schema Repair${c.reset} ──▶ ${c.magenta}Typst Binary${c.reset} ${c.dim}│${c.reset}
  ${c.dim}│${c.reset}    (Qwen / Claude)         structured JSON         ~15ms compile   ${c.dim}│${c.reset}
  ${c.dim}└──────────────────────────────────────────────────────────────────────┘${c.reset}
                                            ${c.dim}│${c.reset}
                                            ${c.dim}▼${c.reset}
                           ${c.dim}┌──────────────────┐${c.reset}
                           ${c.dim}│${c.reset}  ${c.green}GitHub REST API${c.reset} ${c.dim}│${c.reset}
                           ${c.dim}│${c.reset}  (Auto-Commit)    ${c.dim}│${c.reset}
                           ${c.dim}└──────────────────┘${c.reset}

${c.yellow}COST & SPEED BREAKDOWN:${c.reset}
  ${c.green}•${c.reset} Cold Start: ${c.bold}< 1 second${c.reset} ${c.dim}(vs 60s Fargate Spot)${c.reset}
  ${c.green}•${c.reset} Compilation Time: ${c.bold}~15 milliseconds${c.reset} ${c.dim}(vs 3s XeLaTeX)${c.reset}
  ${c.green}•${c.reset} Idle Cost: ${c.bold}$0/month${c.reset} ${c.dim}(100% serverless free tier)${c.reset}
`);
}

function showMenu(options = {}) {
    console.clear();
    if (!options.quiet) {
        console.log(banner);
    }
    console.log(`${c.bold}What would you like to do?${c.reset}\n`);
    console.log(`  ${c.cyan}1.${c.reset} Open Resume Editor`);
    console.log(`  ${c.cyan}2.${c.reset} How It Works (Architecture)`);
    console.log(`  ${c.cyan}3.${c.reset} Exit\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`${c.bold}Option (1-3): ${c.reset}`, async (answer) => {
        rl.close();
        switch (answer.trim()) {
            case '1':
                await startLocalServer(options);
                break;
            case '2':
                showHowItWorks();
                break;
            case '3':
                console.log(`\n${c.dim}Goodbye!${c.reset}\n`);
                process.exit(0);
                break;
            default:
                showMenu(options);
        }
    });
}

async function main() {
    const args = process.argv.slice(2);
    const options = {
        port: 0,
        autoOpen: true,
        quiet: false
    };

    let command = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-h' || arg === '--help' || arg === 'help') {
            showHelp();
            process.exit(0);
        } else if (arg === '-v' || arg === '--version' || arg === 'version') {
            console.log(`v${CONFIG.version}`);
            process.exit(0);
        } else if (arg === '-q' || arg === '--quiet') {
            options.quiet = true;
        } else if (arg === '--no-open') {
            options.autoOpen = false;
        } else if (arg === '-p' || arg === '--port') {
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                options.port = parseInt(nextArg, 10);
                i++;
            }
        } else if (arg.startsWith('--port=')) {
            options.port = parseInt(arg.split('=')[1], 10);
        } else if (arg === 'editor' || arg === 'open' || arg === 'start' || arg === '--open') {
            command = 'open';
        }
    }

    process.on('SIGINT', () => {
        console.log(`\n${c.yellow}Shutting down server... Goodbye!${c.reset}`);
        process.exit(0);
    });

    if (command === 'open') {
        if (!options.quiet) console.log(banner);
        await startLocalServer(options);
        return;
    }

    // If stdin is not a TTY (non-interactive mode), automatically launch local server
    if (!process.stdin.isTTY) {
        if (!options.quiet) console.log(banner);
        await startLocalServer(options);
        return;
    }

    showMenu(options);
}

main().catch(err => {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
});
