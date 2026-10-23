export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Inject transport for tests; UI components never need to know the API origin.
export function createHttpClient(
  transport = globalThis.fetch,
  baseUrl = "/api",
) {
  return async function request(path, method = "GET", body, options = {}) {
    let response;
    try {
      response = await transport(`${baseUrl}${path}`, {
        method,
        credentials: "same-origin",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError(
        "We couldn’t connect. Check your connection and try again.",
        0,
      );
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        data?.error || "Something went wrong. Please try again.",
        response.status,
      );
    }
    if (!data)
      throw new ApiError(
        "The server returned an unexpected response. Please try again.",
        response.status,
      );
    return data;
  };
}

export const request = createHttpClient();
