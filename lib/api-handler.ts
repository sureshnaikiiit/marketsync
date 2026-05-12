import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type RouteHandler = (
  req: Request,
  context?: any
) => Promise<Response>;

export function apiHandler(handler: RouteHandler) {
  return async (req: Request, context?: any) => {
    try {
      return await handler(req, context);
    } catch (error: any) {
      console.error(error);

      // Known application errors
      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            success: false,
            message: error.message,
            details: error.details ?? null,
          },
          { status: error.status }
        );
      }

      // Zod validation
      if (error?.name === "ZodError") {
        return NextResponse.json(
          {
            success: false,
            message: "Validation failed",
            errors: error.errors,
          },
          { status: 400 }
        );
      }

      // Unknown runtime errors
      return NextResponse.json(
        {
          success: false,
          message: "Internal Server Error",
        },
        { status: 500 }
      );
    }
  };
}