#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

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
};

const CONFIG = {
    name: 'Serverless Typst Resume Editor',
    github: 'https://github.com/Vishhh03/Latex-Resume',
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
${c.white}    Serverless Typst & Bedrock Resume Editor${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`;

function openUrl(url) {
    const start = process.platform === 'darwin' ? 'open' :
        process.platform === 'win32' ? 'start' : 'xdg-open';
    require('child_process').exec(`${start} ${url}`);
}

async function startSession() {
    console.log(`\n${c.green}⚡ Serverless Typst Backend Active (< 1s cold start)${c.reset}`);
    console.log(`${c.dim}Opening editor interface...${c.reset}\n`);
    openUrl(CONFIG.apiUrl);
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

function showMenu() {
    console.clear();
    console.log(banner);
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
                await startSession();
                break;
            case '2':
                showHowItWorks();
                break;
            case '3':
                console.log(`\n${c.dim}Goodbye!${c.reset}\n`);
                process.exit(0);
                break;
            default:
                showMenu();
        }
    });
}

showMenu();
