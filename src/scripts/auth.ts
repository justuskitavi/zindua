import "dotenv/config"
import { requireEnv } from "../utils/helpers"

export async function getFEWSAuthToken() {
  const tokenUrl = 'https://fdw.fews.net/api-token-auth/'
  const username = requireEnv("FEWS_USERNAME") 
  const password = requireEnv("FEWS_PASSWORD") 

  const response = await fetch(tokenUrl, {    
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    console.error(`Haiwezi manze!!`)
    throw new Error(`FEWS auth failed: ${response.status} ${response.statusText}`)
    
  }

  const tokenData = await response.json()
  return tokenData.token
}

