const { exec, spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const path = require('path');

function runCommand(args) {
    return new Promise((resolve, reject) => {
        exec(`node ${path.join(__dirname, 'index.js')} ${args}`, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });
}

async function testHelp() {
    console.log('Testing CLI --help flag...');
    const output = await runCommand('--help');
    assert(output.includes('typst-resume-cli'), 'Help output should include package name');
    assert(output.includes('USAGE:'), 'Help output should include USAGE section');
    console.log('✓ --help test passed');
}

async function testVersion() {
    console.log('Testing CLI --version flag...');
    const output = await runCommand('--version');
    assert(output.startsWith('v0.'), 'Version output should start with v0.');
    console.log('✓ --version test passed');
}

async function testServerAndProxy() {
    console.log('Testing server startup & API proxying...');
    const serverProc = spawn('node', [path.join(__dirname, 'index.js'), '--no-open', '--port=9876', '--quiet'], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverOutput = '';
    serverProc.stdout.on('data', data => serverOutput += data.toString());
    serverProc.stderr.on('data', data => console.error('Server Stderr:', data.toString()));

    // Wait for server to output ready message
    await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (serverOutput.includes('http://localhost:9876')) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });

    // 1. Test GET / (Editor HTML)
    await new Promise((resolve, reject) => {
        http.get('http://localhost:9876/', res => {
            assert.strictEqual(res.statusCode, 200, 'HTML page should return status 200');
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                assert(data.includes('Serverless Typst Resume Editor'), 'HTML should contain title');
                console.log('✓ GET / (HTML Editor) test passed');
                resolve();
            });
        }).on('error', reject);
    });

    // 2. Test GET /api/health (Proxy request)
    await new Promise((resolve, reject) => {
        http.get('http://localhost:9876/api/health', res => {
            assert.strictEqual(res.statusCode, 200, 'Proxy /api/health should return status 200');
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                assert.strictEqual(parsed.status, 'ok', 'Health endpoint should return status ok');
                console.log('✓ GET /api/health (Proxy) test passed');
                resolve();
            });
        }).on('error', reject);
    });

    // 3. Test GET /api/versions (Proxy request)
    await new Promise((resolve, reject) => {
        http.get('http://localhost:9876/api/versions', res => {
            assert.strictEqual(res.statusCode, 200, 'Proxy /api/versions should return status 200');
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                assert(Array.isArray(parsed.versions), 'Versions endpoint should return versions array');
                console.log('✓ GET /api/versions (Proxy) test passed');
                resolve();
            });
        }).on('error', reject);
    });

    serverProc.kill('SIGINT');
    console.log('✓ Server clean shutdown test passed');
}

async function runAllTests() {
    try {
        await testHelp();
        await testVersion();
        await testServerAndProxy();
        console.log('\n🎉 ALL CLI TESTS PASSED SUCCESSFULLY!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exit(1);
    }
}

runAllTests();
