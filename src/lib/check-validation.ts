import { ApiError } from "@/lib/api-helpers";

export interface ValidatedCheckInput {
  name: string;
  url: string;
  checkType: "HTTP" | "PING";
  latencyWarnMs: number | null;
}

export function validateCheckInput(body: Record<string, unknown>): ValidatedCheckInput {
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  const checkType: "HTTP" | "PING" = body.checkType === "PING" ? "PING" : "HTTP";
  if (!name || !url) throw new ApiError(400, "Name und Host/URL sind erforderlich");
  if (checkType === "HTTP" && !/^https?:\/\//i.test(url)) {
    throw new ApiError(400, "URL muss mit http:// oder https:// beginnen");
  }
  const latencyWarnMs =
    body.latencyWarnMs === null || body.latencyWarnMs === undefined || body.latencyWarnMs === ""
      ? null
      : Number(body.latencyWarnMs);
  return { name, url, checkType, latencyWarnMs };
}
