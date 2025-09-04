export function env(name: string, fallback?: string) {
const v = process.env[name] ?? fallback;
if (v === undefined) throw new Error(`Missing env: ${name}`);
return v;
}