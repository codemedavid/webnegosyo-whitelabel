#!/usr/bin/env node

/**
 * Build-time environment variable validation script
 * This script runs before the build to ensure all required environment variables are set.
 * Run this as a prebuild script to fail fast when required env vars are missing.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local if it exists (mimicking Next.js behavior)
const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
    const envContent = readFileSync(envLocalPath, 'utf-8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            const value = valueParts.join('='); // Handle values containing '='
            // Only set if not already set in environment
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
}

const REQUIRED_VARS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

const missing = [];

for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
        missing.push(varName);
    }
}

if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:\n');
    for (const varName of missing) {
        console.error(`   • ${varName}`);
    }
    console.error('\nPlease ensure these variables are set in your .env.local file or CI/CD environment.\n');
    process.exit(1);
}

console.log('✅ All required environment variables are present.');
