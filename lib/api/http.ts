import { NextResponse } from "next/server"
import { z } from "zod"

export function jsonError(
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status },
  )
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const raw = await request.text()
    const parsed = schema.safeParse(raw.trim().length === 0 ? {} : JSON.parse(raw))

    if (!parsed.success) {
      return {
        success: false,
        response: jsonError("入力値が不正です", 400, parsed.error.flatten()),
      }
    }

    return { success: true, data: parsed.data }
  } catch {
    return {
      success: false,
      response: jsonError("JSON形式が不正です", 400),
    }
  }
}
