import { warn } from "./logger.js";

const MAX_COMMAND_LENGTH = 500;

const BLOCKED_COMMAND_PATTERNS = [
  { pattern: /\brm\s+-rf\b/i, reason: "Recursive file deletion is blocked" },
  { pattern: /\bsudo\b/i, reason: "Privilege escalation is blocked" },
  { pattern: /\bsu\b/i, reason: "Switch user is blocked" },
  { pattern: /\bpasswd\b/i, reason: "Password changes are blocked" },
  { pattern: /\bchown\b/i, reason: "Ownership changes are blocked" },
  { pattern: /\bchmod\b/i, reason: "Permission changes are blocked" },
  {
    pattern: /\b(mkfs|mount|umount)\b/i,
    reason: "Filesystem modification is blocked",
  },
  { pattern: /\bdd\b/i, reason: "Raw disk operations are blocked" },
  {
    pattern: /\b(iptables|ip6tables|nft)\b/i,
    reason: "Network/firewall configuration is blocked",
  },
  {
    pattern:
      /\b(systemctl|service|journalctl|shutdown|reboot|poweroff|halt)\b/i,
    reason: "System control commands are blocked",
  },
  {
    pattern: /\b(useradd|userdel|groupadd|groupdel)\b/i,
    reason: "User and group management commands are blocked",
  },
  {
    pattern: /\b(chattr|ln\s+-s|chroot)\b/i,
    reason: "Advanced file system operations are blocked",
  },
  {
    pattern: /\b(ssh|scp|sftp|curl|wget|nc|netcat|nmap|tcpdump|telnet)\b/i,
    reason: "External network tools are blocked",
  },
];

const WARNING_COMMAND_PATTERNS = [
  {
    pattern: /\b(find|grep|tail|head|less|more)\b/i,
    reason: "This command may produce large output or may require careful use",
  },
  {
    pattern: /\b(python|perl|ruby|node|bash|sh)\b/i,
    reason: "Interpreter commands are monitored for safety",
  },
  {
    pattern: /\|\s*grep|\|\s*awk|\|\s*sed/i,
    reason: "Pipelines are monitored for safety",
  },
];

const normalizeCommand = (command) =>
  command
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ");

export const validateCommand = (command) => {
  const normalized = normalizeCommand(command || "");

  if (!normalized) {
    return {
      allowed: false,
      severity: "block",
      reason: "Command is empty or invalid",
    };
  }

  if (normalized.length > MAX_COMMAND_LENGTH) {
    return {
      allowed: false,
      severity: "block",
      reason: "Command is too long",
    };
  }

  for (const rule of BLOCKED_COMMAND_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return {
        allowed: false,
        severity: "block",
        reason: rule.reason,
      };
    }
  }

  for (const rule of WARNING_COMMAND_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      warn(`Command flagged for review: ${normalized} — ${rule.reason}`);
      return {
        allowed: true,
        severity: "warning",
        reason: rule.reason,
      };
    }
  }

  return {
    allowed: true,
    severity: "info",
    reason: "Command permitted",
  };
};
