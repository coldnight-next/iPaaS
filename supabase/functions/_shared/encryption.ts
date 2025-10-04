const encoder = new TextEncoder()
const decoder = new TextDecoder()

function requireKeyMaterial() {
  const key = Deno.env.get('ENCRYPTION_KEY')
  if (!key) {
    throw new Error('Missing ENCRYPTION_KEY environment variable')
  }
  try {
    return Uint8Array.from(atob(key), char => char.charCodeAt(0))
  } catch (_error) {
    throw new Error('ENCRYPTION_KEY must be base64 encoded')
  }
}

const keyPromise = crypto.subtle.importKey(
  'raw',
  requireKeyMaterial(),
  { name: 'AES-GCM' },
  false,
  ['encrypt', 'decrypt']
)

function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function encryptJson(payload: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyPromise
  const clearText = encoder.encode(JSON.stringify(payload))
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    clearText
  )

  return `${toBase64(iv)}:${toBase64(cipherBuffer)}`
}

export async function decryptJson<T>(value: string): Promise<T> {
  const [ivEncoded, dataEncoded] = value.split(':')
  if (!ivEncoded || !dataEncoded) {
    throw new Error('Invalid encrypted payload format')
  }

  const iv = fromBase64(ivEncoded)
  const cipherBytes = fromBase64(dataEncoded)
  const key = await keyPromise

  const clearBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  )

  const json = decoder.decode(clearBuffer)
  return JSON.parse(json) as T
}