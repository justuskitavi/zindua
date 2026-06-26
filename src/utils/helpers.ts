export function requireEnv(name: string): string {
    const value = process.env[name]

    if (!value || value.trim() === "") {
        throw new Error(
            `Missing required environment var: ${name}` 
        )        
    }

    return value.trim()
 }