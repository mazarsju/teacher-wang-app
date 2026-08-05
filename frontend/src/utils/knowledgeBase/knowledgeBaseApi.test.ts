import { exportDatabase, importDatabase } from "./knowledgeBaseApi";

describe("knowledgeBaseApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports the database", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            message: "Database exported to db.txt",
            filename: "db.txt",
          }),
        }),
      ),
    );

    const blob = new Blob(["test"], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teacher-wang-export.zip";
    a.click();
    URL.revokeObjectURL(url);
  });

  it("imports a database file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ message: "File received" }),
        }),
      ),
    );

    const file = new File(["爱;ai;4;true;"], "db.txt", { type: "text/plain" });

    await expect(importDatabase(file)).resolves.toEqual({
      message: "File received",
    });
  });

  it("throws when import fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Invalid line format." }),
        }),
      ),
    );

    const file = new File(["invalid"], "db.txt", { type: "text/plain" });

    await expect(importDatabase(file)).rejects.toThrow("Invalid line format.");
  });
});
