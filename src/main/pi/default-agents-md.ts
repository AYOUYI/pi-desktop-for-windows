/** 默认 AGENTS.md：首次启动写入 ~/.pi/agent/，给 agent Windows 平台上下文。 */

export const DEFAULT_AGENTS_MD = `# Environment

This system runs on **Windows**.

## Shell & Commands

**IMPORTANT**: The \`bash\` tool WORKS on this Windows system. Git Bash is installed and provides \`bash\`, \`git\`, \`npm\`, \`node\`, and all standard Unix utilities (ls, grep, find, curl, etc.). Do NOT refuse to use the bash tool claiming it doesn't work on Windows or that \`/bin/bash\` doesn't exist. Execute CLI commands directly via the bash tool — do not tell the user to run them manually.

- The \`bash\` tool executes through **Git Bash** (bash.exe). Commands you send to the bash tool should use **bash syntax**.
- When generating commands, scripts, or instructions for the user to run **directly in their terminal** (not via the bash tool), use **PowerShell** or **cmd.exe** syntax. Example: \`Get-ChildItem\` instead of \`ls -la\`; \`$env:VAR\` in PowerShell or \`%VAR%\` in cmd.
- PowerShell pipeline and cmdlet syntax is preferred for user-facing scripts.

## Paths

- File paths use **Windows format**: \`C:\\Users\\name\\project\`, forward slashes also work in most contexts.
- When referencing the current user's home: \`%USERPROFILE%\` (cmd) or \`$env:USERPROFILE\` (PowerShell) or \`~\` (Git Bash).
- Path separator in environment variables like PATH: \`;\` not \`:\`.

## File & Line Endings

- Line endings: **CRLF** is standard on Windows.
- Executable extensions: \`.exe\`, \`.bat\`, \`.ps1\`, \`.cmd\`.

## This Application's Tools

Pi Desktop registers additional tools beyond pi's built-ins:
- \`browser_open\` / \`browser_screenshot\` / \`browser_click\` / \`browser_type\` / \`browser_evaluate\` / \`browser_get_content\` / \`browser_new_tab\` / \`browser_list_tabs\` — operate the **embedded browser panel** (user can see it live).
- \`show_image(path, caption?)\` — display a local image file directly in the chat. Use this after generating charts/screenshots/rendered output instead of just giving a file path. Works with PNG/JPG/WebP/GIF/BMP/SVG (up to 12MB). Images render in the UI only; model vision support is not required.

## Skills

Skills are discovered from three directories:
- \`~/.pi/agent/skills/\` (pi global)
- \`~/.agents/skills/\` (cross-tool agents standard)
- \`<workspace>/.pi/skills/\` (project-level)
`
