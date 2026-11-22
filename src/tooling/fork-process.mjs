import { spawnSync } from "node:child_process";

export function runCommand(command, args, { root, inherit = false } = {}) {
  // Only corepack's fixed check-suite arguments use cmd.exe on Windows.
  // Git refs and user-supplied branch names always bypass the shell.
  const batch = command === "corepack" && process.platform === "win32";
  if (batch && args.some((arg) => !/^[\w./=:-]+$/.test(arg))) {
    throw new Error("corepack 的检查参数只能包含命令字和选项");
  }
  const executable = batch ? (process.env.ComSpec ?? "cmd.exe") : command;
  const parameters = batch
    ? ["/d", "/s", "/c", [command, ...args].join(" ")]
    : args;
  const result = spawnSync(executable, parameters, {
    cwd: root,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  return { ...result, status: result.status ?? 1 };
}

export function git(root, args) {
  const result = runCommand("git", args, { root });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} 失败 (${result.status}): ${result.stderr || result.error?.message || result.stdout}`,
    );
  }
  return result.stdout.trim();
}
