import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";
import * as adminApi from "../utils/admin/adminApi";

vi.mock("../utils/admin/adminApi", () => ({
  fetchUsers: vi.fn(),
  updateUserPlan: vi.fn(),
  deleteUser: vi.fn(),
  reloadHskContent: vi.fn(),
  generateArticles: vi.fn(),
  reloadGrammarRules: vi.fn(),
  uploadHskTranslation: vi.fn(),
}));

const fetchUsers = vi.mocked(adminApi.fetchUsers);
const updateUserPlan = vi.mocked(adminApi.updateUserPlan);
const deleteUser = vi.mocked(adminApi.deleteUser);
const reloadHskContent = vi.mocked(adminApi.reloadHskContent);
const generateArticles = vi.mocked(adminApi.generateArticles);
const reloadGrammarRules = vi.mocked(adminApi.reloadGrammarRules);
const uploadHskTranslation = vi.mocked(adminApi.uploadHskTranslation);

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists users with their plan", async () => {
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        email: "b@example.com",
        plan: "pro",
        last_connection: "2026-02-02T00:00:00Z",
      },
    ]);

    render(<AdminPage />);

    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Plan for a@example.com")).toHaveValue("free");
    expect(screen.getByLabelText("Plan for b@example.com")).toHaveValue("pro");
  });

  it("upgrades a user's plan and reflects the response", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
    ]);
    updateUserPlan.mockResolvedValue({
      id: "1",
      email: "a@example.com",
      plan: "pro",
      last_connection: "2026-01-01T00:00:00Z",
    });

    render(<AdminPage />);

    await screen.findByText("a@example.com");
    await user.selectOptions(
      screen.getByLabelText("Plan for a@example.com"),
      "pro",
    );

    await waitFor(() => {
      expect(updateUserPlan).toHaveBeenCalledWith("1", "pro");
    });
    expect(screen.getByLabelText("Plan for a@example.com")).toHaveValue("pro");
  });

  it("shows an error when loading users fails", async () => {
    fetchUsers.mockRejectedValue(new Error("Failed to load users."));

    render(<AdminPage />);

    expect(await screen.findByText("Failed to load users.")).toBeInTheDocument();
  });

  it("deletes a user after confirming", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
    ]);
    deleteUser.mockResolvedValue(undefined);

    render(<AdminPage />);

    await screen.findByText("a@example.com");
    await user.click(screen.getByLabelText("Delete a@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith("1");
    });
    expect(screen.queryByText("a@example.com")).not.toBeInTheDocument();
  });

  it("cancelling the delete confirmation keeps the user", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
    ]);

    render(<AdminPage />);

    await screen.findByText("a@example.com");
    await user.click(screen.getByLabelText("Delete a@example.com"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
  });

  it("reloads the HSK database after confirming", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    reloadHskContent.mockResolvedValue(undefined);

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(
      screen.getByRole("button", { name: "Reload HSK database" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(reloadHskContent).toHaveBeenCalledTimes(1);
    });
  });

  it("cancelling the HSK reload confirmation does not call the API", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(
      screen.getByRole("button", { name: "Reload HSK database" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(reloadHskContent).not.toHaveBeenCalled();
  });

  it("shows an error when reloading the HSK database fails", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    reloadHskContent.mockRejectedValue(
      new Error("Failed to reload the HSK database."),
    );

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(
      screen.getByRole("button", { name: "Reload HSK database" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to reload the HSK database."),
    ).toBeInTheDocument();
  });

  it("refreshes articles", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    generateArticles.mockResolvedValue(undefined);

    render(<AdminPage />);

    await screen.findByText("Weekly articles");
    await user.click(screen.getByRole("button", { name: "Refresh articles" }));

    await waitFor(() => {
      expect(generateArticles).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error when refreshing articles fails", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    generateArticles.mockRejectedValue(
      new Error("Failed to refresh articles."),
    );

    render(<AdminPage />);

    await screen.findByText("Weekly articles");
    await user.click(screen.getByRole("button", { name: "Refresh articles" }));

    expect(
      await screen.findByText("Failed to refresh articles."),
    ).toBeInTheDocument();
  });

  it("reloads grammar rules", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    reloadGrammarRules.mockResolvedValue(undefined);

    render(<AdminPage />);

    await screen.findByText("Grammar rules");
    await user.click(
      screen.getByRole("button", { name: "Reload grammar rules" }),
    );

    await waitFor(() => {
      expect(reloadGrammarRules).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error when reloading grammar rules fails", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    reloadGrammarRules.mockRejectedValue(
      new Error("Failed to reload grammar rules."),
    );

    render(<AdminPage />);

    await screen.findByText("Grammar rules");
    await user.click(
      screen.getByRole("button", { name: "Reload grammar rules" }),
    );

    expect(
      await screen.findByText("Failed to reload grammar rules."),
    ).toBeInTheDocument();
  });

  it("loads an HSK translation file after confirming", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    uploadHskTranslation.mockResolvedValue(undefined);

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(screen.getByRole("button", { name: "Load translation" }));

    const file = new File(["zip-content"], "translations.zip", {
      type: "application/zip",
    });
    await user.upload(screen.getByLabelText("File (zip)"), file);
    await user.selectOptions(screen.getByLabelText("Language"), "fr");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(uploadHskTranslation).toHaveBeenCalledWith(file, "fr");
    });
  });

  it("cancelling the load translation modal does not call the API", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(screen.getByRole("button", { name: "Load translation" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(uploadHskTranslation).not.toHaveBeenCalled();
  });

  it("shows an error when loading HSK translations fails", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([]);
    uploadHskTranslation.mockRejectedValue(
      new Error("Failed to load HSK translations."),
    );

    render(<AdminPage />);

    await screen.findByText("HSK database");
    await user.click(screen.getByRole("button", { name: "Load translation" }));
    await user.upload(
      screen.getByLabelText("File (zip)"),
      new File(["zip-content"], "translations.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to load HSK translations."),
    ).toBeInTheDocument();
  });
});
