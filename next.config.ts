import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md on dev boot. They are generated output
  // rather than source, and regenerating them puts noise in every diff.
  agentRules: false,
};

export default nextConfig;
