import { post } from './client'

interface ChatResponse {
  success?: boolean
  reply?: string
  error?: string
}

interface ChatContext {
  agent: string
  appState: string
  uploadedFiles: string[]
  buckets: string[]
}

export async function sendChatMessage(message: string, context: ChatContext): Promise<string> {
  const contextBlock = [
    `You are the ${context.agent} inside the Strenth.ai sourcing UI.`,
    `Current UI state: ${context.appState}.`,
    context.uploadedFiles.length > 0
      ? `Uploaded files: ${context.uploadedFiles.join(', ')}.`
      : 'No uploaded files yet.',
    context.buckets.length > 0
      ? `Detected project folders: ${context.buckets.join(', ')}.`
      : 'No project folders yet.',
    'Answer as a concise sourcing/manufacturing assistant. If the user asks about the uploaded design package, use the uploaded file context.',
    '',
    `User message: ${message}`,
  ].join('\n')

  const res = await post<ChatResponse>('/api/chat', { message: contextBlock })
  if (res.reply) return res.reply
  if (res.error) throw new Error(res.error)
  throw new Error('Chat backend returned no reply')
}
