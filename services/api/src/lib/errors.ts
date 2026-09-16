export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (code: string, message: string) => new ApiError(401, code, message);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const gone = (code: string, message: string) => new ApiError(410, code, message);
