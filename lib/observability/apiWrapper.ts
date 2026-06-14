import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from '../tenantApi/http'
import { logError, logInfo } from './logger'
import { createRequestId, getRequestIdFromHeaders } from './requestId'
import { captureServerException, initServerSentry } from './sentryServer'

export type ApiHandler = (
  req: IncomingMessage & { method?: string },
  res: ServerResponse,
) => Promise<void>

export function withObservability(name: string, handler: ApiHandler): ApiHandler {
  initServerSentry()

  return async (req, res) => {
    const requestId = getRequestIdFromHeaders(req) ?? createRequestId()
    const started = Date.now()
    const method = req.method ?? 'GET'
    const path = new URL(req.url ?? '/', 'http://localhost').pathname

    res.setHeader('X-Request-Id', requestId)
    logInfo('api.request.start', { request_id: requestId, handler: name, method, path })

    try {
      await handler(req, res)
      logInfo('api.request.end', {
        request_id: requestId,
        handler: name,
        method,
        path,
        duration_ms: Date.now() - started,
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      captureServerException(err, { request_id: requestId, handler: name, method, path })
      logError('api.request.error', {
        request_id: requestId,
        handler: name,
        method,
        path,
        error: err.message,
        duration_ms: Date.now() - started,
      })
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error', request_id: requestId })
      }
    }
  }
}
