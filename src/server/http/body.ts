import { AppError } from "./errors";
import { readJson } from "./route";

export interface ParsedUpload {
  name: string;
  bytes: Uint8Array;
}

/**
 * Reads either a JSON body, or multipart form-data with a JSON "data" field plus files.
 * File types are checked later by magic bytes; the browser-sent type is ignored.
 */
export async function readJsonOrMultipart(
  req: Request,
  fileField: string,
): Promise<{ data: unknown; files: ParsedUpload[] }> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) return { data: await readJson(req), files: [] };

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("BAD_REQUEST", "Could not read the upload.");
  }
  const raw = form.get("data");
  let data: unknown = {};
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new AppError("BAD_REQUEST", 'The "data" field must be JSON.');
    }
  }
  const files: ParsedUpload[] = [];
  for (const f of form.getAll(fileField)) {
    if (typeof f === "string") continue;
    files.push({ name: f.name || "file", bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return { data, files };
}
