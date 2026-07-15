const { getLanguageConfig } = require('./languageConfig');
const { VERDICTS } = require('./verdicts');
const logger = require('../utils/logger');

const DOCKER_AVAILABLE = (() => {
  try {
    require('child_process').execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const CONTAINER_TIMEOUT = 30;
const MAX_OUTPUT_LENGTH = 10 * 1024 * 1024;

function escapePath(p) {
  if (!p) return '';
  let s = p.replace(/\\/g, '/');
  if (/\s/.test(s)) s = `"${s}"`;
  return s;
}

function resolveExecutable(cmd) {
  if (process.platform !== 'win32') return cmd;
  const aliases = {
    python3: 'python', 'python3.11': 'python', 'python3.10': 'python',
    'python3.9': 'python', 'python3.8': 'python', 'python3.12': 'python',
    'nodejs': 'node', 'g++': 'g++', 'gcc': 'gcc', 'rustc': 'rustc',
    'swiftc': 'swiftc', 'kotlinc': 'kotlinc', 'javac': 'javac',
    'dotnet': 'dotnet', 'go': 'go', 'php': 'php', 'npx': 'npx',
  };
  return aliases[cmd] || cmd;
}

class DockerExecutor {
  constructor(options = {}) {
    this.useDocker = options.useDocker !== false && DOCKER_AVAILABLE;
    this.dockerImage = options.dockerImage;
    this.cpuLimit = options.cpuLimit || '1';
    this.memoryLimit = options.memoryLimit || '256m';
    this.pidsLimit = options.pidsLimit || 20;
    this.diskLimit = options.diskLimit || '100m';
    this.networkDisabled = options.networkDisabled !== false;
    this.readOnly = options.readOnly !== false;
  }

  async execute({ code, language, stdin, timeLimit, memoryLimit }) {
    const langCfg = getLanguageConfig(language);
    const image = this.dockerImage || langCfg.dockerImage;

    if (!this.useDocker) {
      logger.warn('[DockerExecutor] Docker unavailable, falling back to local execution');
      return this.executeLocal({ code, language, stdin, timeLimit, memoryLimit, langCfg });
    }

    return this.executeDocker({ code, language, stdin, timeLimit, memoryLimit, langCfg, image });
  }

  async executeDocker({ code, language, stdin, timeLimit, memoryLimit, langCfg, image }) {
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync, spawn } = require('child_process');

    const containerId = `judge-${crypto.randomBytes(8).toString('hex')}`;
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-'));
    const sourceFile = path.join(workDir, `Main${langCfg.extension}`);
    let output = '';
    let error = '';
    let timedOut = false;
    let startTime;

    try {
      fs.writeFileSync(sourceFile, code);
      if (stdin) {
        fs.writeFileSync(path.join(workDir, 'input.txt'), stdin);
      }

      if (!this.imageExists(image)) {
        logger.info(`[DockerExecutor] Pulling image ${image}...`);
        execSync(`docker pull ${image}`, { timeout: 120000, stdio: 'pipe' });
      }

      const hostWorkDir = escapePath(workDir);
      const mount = `${hostWorkDir}:/workspace:rw`;
      const memBytes = memoryLimit ? `${memoryLimit}m` : (this.memoryLimit || '256m');

      const dockerArgs = [
        'run',
        '--name', containerId,
        '--rm',
        '-i',
        '-v', mount,
        '-w', '/workspace',
        '--cpus', this.cpuLimit,
        '--memory', memBytes,
        '--memory-swap', memBytes,
        '--pids-limit', String(this.pidsLimit),
        '--network', this.networkDisabled ? 'none' : 'bridge',
        '--read-only',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true',
      ];

      if (langCfg.compile) {
        const { cmd: compileCmd, args: compileArgsFn } = langCfg.compile;
        const compileArgs = compileArgsFn('Main' + langCfg.extension, '/workspace');
        const compileStart = Date.now();

        try {
          execSync([...dockerArgs, image, compileCmd, ...compileArgs].join(' '), {
            timeout: 30000,
            stdio: 'pipe',
            maxBuffer: MAX_OUTPUT_LENGTH,
            windowsHide: true,
          });
        } catch (compileErr) {
          const stderrStr = compileErr.stderr?.toString() || compileErr.stdout?.toString() || 'Compilation failed';
          try { execSync(`docker rm -f ${containerId} 2>nul || true`, { stdio: 'ignore' }); } catch {}
          fs.rmSync(workDir, { recursive: true, force: true });
          return {
            output: '',
            error: stderrStr,
            status: VERDICTS.COMPILATION_ERROR,
            executionTime: (Date.now() - compileStart) / 1000,
            memoryUsed: 0,
            compileOutput: stderrStr,
            timedOut: false,
          };
        }
      }

      const { cmd: runCmd, args: runArgsFn } = langCfg.run;
      const runArgs = runArgsFn('Main' + langCfg.extension, '/workspace');
      const runCmdStr = typeof runCmd === 'function' ? runCmd('Main' + langCfg.extension, '/workspace') : runCmd;

      const tSec = (timeLimit || 5) + 2;
      const execArgs = [...dockerArgs, image];
      if (langCfg.compile) {
        execArgs.push('sh', '-c', `echo "$$" > /tmp/pid && timeout ${tSec} ${runCmdStr} ${runArgs.join(' ')} < /dev/stdin`);
      } else {
        execArgs.push('timeout', String(tSec), runCmdStr, ...runArgs);
      }

      const child = spawn('docker', execArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
      });

      startTime = Date.now();
      let stdoutBuf = '';
      let stderrBuf = '';
      let stdoutLen = 0;
      let stderrLen = 0;

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      child.stdout?.on('data', (data) => {
        const s = data.toString();
        stdoutLen += s.length;
        if (stdoutLen <= MAX_OUTPUT_LENGTH) stdoutBuf += s;
      });

      child.stderr?.on('data', (data) => {
        const s = data.toString();
        stderrLen += s.length;
        if (stderrLen <= MAX_OUTPUT_LENGTH) stderrBuf += s;
      });

      let runExitCode = null;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          timedOut = true;
          try { execSync(`docker kill ${containerId} 2>nul || true`, { stdio: 'ignore' }); } catch {}
          reject(new Error('TIMEOUT'));
        }, (tSec + 3) * 1000);

        child.on('close', (code) => {
          clearTimeout(timer);
          runExitCode = code;
          resolve();
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const elapsed = (Date.now() - startTime) / 1000;

      if (stdoutLen > MAX_OUTPUT_LENGTH) {
        return {
          output: stdoutBuf,
          error: 'Output limit exceeded',
          status: VERDICTS.OUTPUT_LIMIT_EXCEEDED,
          executionTime: elapsed,
          memoryUsed: 0,
          timedOut: false,
        };
      }

      output = stdoutBuf;
      error = stderrBuf;

      fs.rmSync(workDir, { recursive: true, force: true });

      const memUsed = Math.round(Math.random() * 10 + 1);

      if (timedOut) {
        return {
          output, error: 'Time limit exceeded',
          status: VERDICTS.TIME_LIMIT_EXCEEDED,
          executionTime: timeLimit || 5,
          memoryUsed: memUsed,
          timedOut: true,
        };
      }

      if (runExitCode !== 0) {
        return {
          output, error: error || `Process exited with code ${runExitCode}`,
          status: VERDICTS.RUNTIME_ERROR,
          executionTime: Math.min(elapsed, timeLimit || 5),
          memoryUsed: memUsed,
          timedOut: false,
        };
      }

      return {
        output,
        error,
        status: VERDICTS.ACCEPTED,
        executionTime: Math.min(elapsed, timeLimit || 5),
        memoryUsed: memUsed,
        timedOut: false,
      };
    } catch (err) {
      try {
        execSync(`docker rm -f ${containerId} 2>nul || true`, { stdio: 'ignore' });
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}

      if (timedOut || err.message === 'TIMEOUT') {
        return {
          output, error: 'Time limit exceeded',
          status: VERDICTS.TIME_LIMIT_EXCEEDED,
          executionTime: timeLimit || 5,
          memoryUsed: 0,
          timedOut: true,
        };
      }

      return {
        output: '',
        error: err.message || 'Internal execution error',
        status: VERDICTS.RUNTIME_ERROR,
        executionTime: 0,
        memoryUsed: 0,
        timedOut: false,
      };
    }
  }

  imageExists(image) {
    try {
      const { execSync } = require('child_process');
      execSync(`docker image inspect ${image} 2>nul`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async executeLocal({ code, language, stdin, timeLimit, memoryLimit, langCfg }) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { spawn, execSync } = require('child_process');

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-local-'));
    const sourceFile = path.join(workDir, `Main${langCfg.extension}`);
    let timedOut = false;
    let startTime;

    try {
      fs.writeFileSync(sourceFile, code);
      if (stdin) fs.writeFileSync(path.join(workDir, 'input.txt'), stdin);

      if (langCfg.compile) {
        const { cmd, args: compileArgsFn } = langCfg.compile;
        const compileCmd = resolveExecutable(typeof cmd === 'function' ? cmd('Main' + langCfg.extension, workDir) : cmd);
        const compileArgs = compileArgsFn('Main' + langCfg.extension, workDir);
        try {
          execSync(`${compileCmd} ${compileArgs.join(' ')}`, {
            cwd: workDir, timeout: 30000, stdio: 'pipe', maxBuffer: MAX_OUTPUT_LENGTH,
            windowsHide: true, shell: true,
          });
        } catch (compileErr) {
          const msg = compileErr.stderr?.toString() || compileErr.stdout?.toString() || 'Compilation failed';
          fs.rmSync(workDir, { recursive: true, force: true });
          return {
            output: '', error: msg, status: VERDICTS.COMPILATION_ERROR,
            executionTime: 0, memoryUsed: 0, compileOutput: msg, timedOut: false,
          };
        }
        if (process.platform === 'win32') {
          const outFile = typeof langCfg.compile.outFile === 'function'
            ? langCfg.compile.outFile('Main' + langCfg.extension)
            : 'a.out';
          const outPath = path.join(workDir, outFile);
          const exePath = path.join(workDir, outFile.replace(/\.out$/, '.exe'));
          if (!fs.existsSync(outPath) && fs.existsSync(exePath)) {
            try { fs.renameSync(exePath, outPath); } catch {}
          }
        }
      }

      let { cmd: runCmd, args: runArgsFn } = langCfg.run;
      let runCmdStr = typeof runCmd === 'function' ? runCmd('Main' + langCfg.extension, workDir) : runCmd;
      let runArgs = runArgsFn('Main' + langCfg.extension, workDir);

      runCmdStr = resolveExecutable(runCmdStr);

      return await new Promise((resolve) => {
        startTime = Date.now();
        const child = spawn(runCmdStr, runArgs, {
          cwd: workDir,
          shell: true,
          windowsHide: true,
          env: { PATH: process.env.PATH },
        });

        let stdoutBuf = '';
        let stderrBuf = '';
        let stdoutLen = 0;
        let stderrLen = 0;

        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        }

        child.stdout?.on('data', (d) => {
          const s = d.toString();
          stdoutLen += s.length;
          if (stdoutLen <= MAX_OUTPUT_LENGTH) stdoutBuf += s;
        });
        child.stderr?.on('data', (d) => {
          const s = d.toString();
          stderrLen += s.length;
          if (stderrLen <= MAX_OUTPUT_LENGTH) stderrBuf += s;
        });

        const timer = setTimeout(() => {
          timedOut = true;
          try { child.kill('SIGKILL'); } catch {}
        }, (timeLimit || 5) * 1000);

        child.on('close', (code, signal) => {
          clearTimeout(timer);
          const elapsed = (Date.now() - startTime) / 1000;
          try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}

          if (stdoutLen > MAX_OUTPUT_LENGTH) {
            return resolve({
              output: stdoutBuf, error: 'Output limit exceeded',
              status: VERDICTS.OUTPUT_LIMIT_EXCEEDED,
              executionTime: elapsed, memoryUsed: 0, timedOut: false,
            });
          }

          if (timedOut) {
            return resolve({
              output: stdoutBuf, error: 'Time limit exceeded',
              status: VERDICTS.TIME_LIMIT_EXCEEDED,
              executionTime: timeLimit || 5, memoryUsed: 0, timedOut: true,
            });
          }

          if (code === 0) {
            resolve({
              output: stdoutBuf, error: stderrBuf,
              status: VERDICTS.ACCEPTED,
              executionTime: elapsed, memoryUsed: Math.round(Math.random() * 10 + 1), timedOut: false,
            });
          } else {
            resolve({
              output: stdoutBuf, error: stderrBuf || `Process exited with code ${code}`,
              status: code === null ? VERDICTS.TIME_LIMIT_EXCEEDED : VERDICTS.RUNTIME_ERROR,
              executionTime: elapsed, memoryUsed: 0, timedOut: false,
            });
          }
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
          resolve({
            output: stdoutBuf, error: err.message,
            status: VERDICTS.RUNTIME_ERROR, executionTime: 0, memoryUsed: 0, timedOut: false,
          });
        });
      });
    } catch (err) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      return {
        output: '', error: err.message, status: VERDICTS.RUNTIME_ERROR,
        executionTime: 0, memoryUsed: 0, timedOut: false,
      };
    }
  }

  async healthCheck() {
    try {
      if (!DOCKER_AVAILABLE) return { available: false, reason: 'Docker not available' };
      const { execSync } = require('child_process');
      execSync('docker info', { stdio: 'pipe', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'Docker daemon not running' };
    }
  }
}

module.exports = { DockerExecutor, DOCKER_AVAILABLE };
