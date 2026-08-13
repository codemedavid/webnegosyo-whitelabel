// Re-export the native module. On web, it will be resolved to SmsSenderModule.web.ts
// and on native platforms to SmsSenderModule.ts
export { default } from './src/SmsSenderModule';
